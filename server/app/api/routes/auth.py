"""Authentication API routes."""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Depends, Header
from pydantic import BaseModel, EmailStr, Field

from app.db import get_pool
from app.services.auth_service import auth_service, TokenPair


router = APIRouter(prefix="/auth", tags=["authentication"])


# ==================== REQUEST/RESPONSE MODELS ====================

class RegisterRequest(BaseModel):
    """User registration request."""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: Optional[str] = Field(None, max_length=100)


class LoginRequest(BaseModel):
    """User login request."""
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    """Token refresh request."""
    refresh_token: str


class UserResponse(BaseModel):
    """User data response."""
    id: UUID
    email: str
    display_name: Optional[str]
    is_verified: bool
    created_at: datetime


class AuthResponse(BaseModel):
    """Authentication response with tokens and user."""
    user: UserResponse
    tokens: TokenPair


# ==================== HELPER FUNCTIONS ====================

async def get_current_user(authorization: Optional[str] = Header(None)) -> UserResponse:
    """Get current authenticated user from JWT token."""
    if not authorization:
        print("[DEBUG] No Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = parts[1]
    payload = auth_service.verify_access_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Fetch user from database
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, display_name, is_verified, created_at
            FROM users WHERE id = $1 AND is_active = TRUE
            """,
            UUID(payload.sub)
        )
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )
        
        return UserResponse(
            id=row["id"],
            email=row["email"],
            display_name=row["display_name"],
            is_verified=row["is_verified"],
            created_at=row["created_at"],
        )


async def get_current_user_optional(
    authorization: Optional[str] = Header(None)
) -> Optional[UserResponse]:
    """Get current authenticated user if token is valid, else None."""
    if not authorization:
        return None
    
    try:
        user = await get_current_user(authorization)
        print(f"[DEBUG] Optional Auth Success: {user.email}")
        return user
    except HTTPException:
        print("[DEBUG] Optional Auth: Token invalid/expired, treating as Guest")
        return None


# ==================== ROUTES ====================

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest) -> AuthResponse:
    """Register a new user account."""
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        # Check if email already exists
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1",
            request.email
        )
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )
        
        # Hash password
        password_hash = auth_service.hash_password(request.password)
        
        # Create user
        row = await conn.fetchrow(
            """
            INSERT INTO users (email, password_hash, display_name, external_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, email, display_name, is_verified, created_at
            """,
            request.email,
            password_hash,
            request.display_name or request.email.split("@")[0],
            f"email:{request.email}"  # external_id for compatibility
        )
        
        user = UserResponse(
            id=row["id"],
            email=row["email"],
            display_name=row["display_name"],
            is_verified=row["is_verified"],
            created_at=row["created_at"],
        )
        
        # Generate tokens
        token_pair, token_hash, expires_at = auth_service.create_token_pair(user.id)
        
        # Store refresh token
        await conn.execute(
            """
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            """,
            user.id,
            token_hash,
            expires_at
        )
        
        return AuthResponse(user=user, tokens=token_pair)


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest) -> AuthResponse:
    """Login with email and password."""
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        # Fetch user
        row = await conn.fetchrow(
            """
            SELECT id, email, password_hash, display_name, is_verified, is_active, created_at
            FROM users WHERE email = $1
            """,
            request.email
        )
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        
        if not row["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated",
            )
        
        # Verify password
        if not row["password_hash"] or not auth_service.verify_password(request.password, row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        
        user = UserResponse(
            id=row["id"],
            email=row["email"],
            display_name=row["display_name"],
            is_verified=row["is_verified"],
            created_at=row["created_at"],
        )
        
        # Update last login
        await conn.execute(
            "UPDATE users SET last_login_at = $1 WHERE id = $2",
            datetime.now(timezone.utc),
            user.id
        )
        
        # Generate tokens
        token_pair, token_hash, expires_at = auth_service.create_token_pair(user.id)
        
        # Store refresh token
        await conn.execute(
            """
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            """,
            user.id,
            token_hash,
            expires_at
        )
        
        return AuthResponse(user=user, tokens=token_pair)


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(request: RefreshRequest) -> TokenPair:
    """Refresh access token using refresh token."""
    pool = await get_pool()
    
    # Hash the provided token
    token_hash = auth_service.hash_token(request.refresh_token)
    
    async with pool.acquire() as conn:
        # Find valid refresh token
        row = await conn.fetchrow(
            """
            SELECT rt.id, rt.user_id, u.is_active
            FROM refresh_tokens rt
            JOIN users u ON u.id = rt.user_id
            WHERE rt.token_hash = $1
              AND rt.expires_at > NOW()
              AND rt.revoked_at IS NULL
            """,
            token_hash
        )
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )
        
        if not row["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated",
            )
        
        user_id = row["user_id"]
        old_token_id = row["id"]
        
        # Revoke old refresh token (rotation)
        await conn.execute(
            "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1",
            old_token_id
        )
        
        # Generate new token pair
        token_pair, new_token_hash, expires_at = auth_service.create_token_pair(user_id)
        
        # Store new refresh token
        await conn.execute(
            """
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            """,
            user_id,
            new_token_hash,
            expires_at
        )
        
        return token_pair


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: RefreshRequest,
    current_user: UserResponse = Depends(get_current_user)
) -> None:
    """Logout and revoke refresh token."""
    pool = await get_pool()
    
    token_hash = auth_service.hash_token(request.refresh_token)
    
    async with pool.acquire() as conn:
        # Revoke the refresh token
        result = await conn.execute(
            """
            UPDATE refresh_tokens 
            SET revoked_at = NOW() 
            WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL
            """,
            token_hash,
            current_user.id
        )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Get current authenticated user."""
    return current_user
