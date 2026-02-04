"""Authentication service for HumanSign.

Handles:
- Password hashing with bcrypt
- JWT token generation and verification
- Refresh token management
"""

import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from uuid import UUID

import bcrypt
import jwt
from pydantic import BaseModel

from app.config import get_settings


class TokenPair(BaseModel):
    """Access and refresh token pair."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenPayload(BaseModel):
    """JWT token payload."""
    sub: str  # user_id
    exp: datetime
    iat: datetime
    type: str  # "access" or "refresh"


class AuthService:
    """Authentication service singleton."""
    
    def __init__(self):
        self._settings = get_settings()
    
    # ==================== PASSWORD HASHING ====================
    
    def hash_password(self, password: str) -> str:
        """Hash a password using bcrypt."""
        salt = bcrypt.gensalt(rounds=12)
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def verify_password(self, password: str, hashed: str) -> bool:
        """Verify a password against its hash."""
        try:
            return bcrypt.checkpw(
                password.encode('utf-8'),
                hashed.encode('utf-8')
            )
        except Exception:
            return False
    
    # ==================== JWT TOKENS ====================
    
    def create_access_token(self, user_id: UUID, extra_claims: dict[str, Any] | None = None) -> str:
        """Create a JWT access token."""
        now = datetime.now(timezone.utc)
        expire = now + timedelta(minutes=self._settings.access_token_expire_minutes)
        
        payload = {
            "sub": str(user_id),
            "exp": expire,
            "iat": now,
            "type": "access",
        }
        
        if extra_claims:
            payload.update(extra_claims)
        
        return jwt.encode(
            payload,
            self._settings.jwt_secret_key,
            algorithm=self._settings.jwt_algorithm
        )
    
    def create_refresh_token(self) -> tuple[str, str, datetime]:
        """
        Create a refresh token (random string, not JWT).
        
        Returns:
            tuple of (raw_token, token_hash, expires_at)
        """
        # Generate a cryptographically secure token
        raw_token = secrets.token_urlsafe(64)
        
        # Hash the token for storage (never store raw tokens)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=self._settings.refresh_token_expire_days
        )
        
        return raw_token, token_hash, expires_at
    
    def hash_token(self, token: str) -> str:
        """Hash a token for lookup."""
        return hashlib.sha256(token.encode()).hexdigest()
    
    def create_token_pair(self, user_id: UUID) -> tuple[TokenPair, str, datetime]:
        """
        Create both access and refresh tokens.
        
        Returns:
            tuple of (TokenPair, refresh_token_hash, refresh_expires_at)
        """
        access_token = self.create_access_token(user_id)
        refresh_token, token_hash, expires_at = self.create_refresh_token()
        
        token_pair = TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=self._settings.access_token_expire_minutes * 60
        )
        
        return token_pair, token_hash, expires_at
    
    def verify_access_token(self, token: str) -> Optional[TokenPayload]:
        """Verify and decode an access token."""
        try:
            payload = jwt.decode(
                token,
                self._settings.jwt_secret_key,
                algorithms=[self._settings.jwt_algorithm]
            )
            
            if payload.get("type") != "access":
                return None
            
            return TokenPayload(
                sub=payload["sub"],
                exp=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
                iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
                type=payload["type"]
            )
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
    
    # ==================== VERIFICATION TOKENS ====================
    
    def create_verification_token(self) -> tuple[str, str, datetime]:
        """
        Create an email/password verification token.
        
        Returns:
            tuple of (raw_token, token_hash, expires_at)
        """
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        
        return raw_token, token_hash, expires_at


# Singleton instance
auth_service = AuthService()
