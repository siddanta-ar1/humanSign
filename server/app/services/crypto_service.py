"""Cryptographic signing service for document verification."""

import hashlib
import json
import base64
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class SignedBundle(BaseModel):
    """Signed document bundle."""
    version: str = "1.0"
    created_at: str
    document_hash: str
    content_hash: str
    metadata: dict[str, Any]
    signature: str
    verification_url: str


class CryptoService:
    """Cryptographic operations for document signing."""
    
    def __init__(self):
        # In production, this would use ECDSA keys loaded from secure storage
        # For now, we use HMAC-SHA256 with a server secret
        from app.config import get_settings
        self._settings = get_settings()
    
    def hash_content(self, content: str) -> str:
        """Create SHA-256 hash of content."""
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    def hash_document(self, 
                      content: str, 
                      session_id: UUID, 
                      keystroke_count: int,
                      classification: str,
                      confidence: float) -> str:
        """Create hash of document with verification metadata."""
        data = {
            "content_hash": self.hash_content(content),
            "session_id": str(session_id),
            "keystroke_count": keystroke_count,
            "classification": classification,
            "confidence": confidence,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        canonical = json.dumps(data, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    
    def sign_data(self, data: str) -> str:
        """Sign data using HMAC-SHA256.
        
        In production, this would use ECDSA with the server's private key.
        """
        import hmac
        signature = hmac.new(
            self._settings.secret_key.encode('utf-8'),
            data.encode('utf-8'),
            hashlib.sha256
        ).digest()
        return base64.b64encode(signature).decode('utf-8')
    
    def verify_signature(self, data: str, signature: str) -> bool:
        """Verify HMAC-SHA256 signature."""
        import hmac
        expected = self.sign_data(data)
        return hmac.compare_digest(expected, signature)
    
    def create_signed_bundle(self,
                              content: str,
                              session_id: UUID,
                              keystroke_count: int,
                              classification: str,
                              confidence: float,
                              user_email: str) -> SignedBundle:
        """Create a signed verification bundle.
        
        This bundle can be exported as a .humansign file and verified later.
        """
        now = datetime.now(timezone.utc)
        content_hash = self.hash_content(content)
        
        # Create document hash including all verification data
        doc_hash = self.hash_document(
            content, session_id, keystroke_count, classification, confidence
        )
        
        metadata = {
            "session_id": str(session_id),
            "keystroke_count": keystroke_count,
            "classification": classification,
            "confidence": confidence,
            "author_email_hash": hashlib.sha256(user_email.encode()).hexdigest()[:16],
            "signed_at": now.isoformat()
        }
        
        # Sign the document hash
        signature = self.sign_data(doc_hash)
        
        # Generate verification URL (would link to hosted verification page)
        base_url = self._settings.cors_origins[0] if self._settings.cors_origins else "https://humansign.io"
        verification_url = f"{base_url}/verify/{doc_hash[:16]}"
        
        return SignedBundle(
            created_at=now.isoformat(),
            document_hash=doc_hash,
            content_hash=content_hash,
            metadata=metadata,
            signature=signature,
            verification_url=verification_url
        )
    
    def export_bundle(self, bundle: SignedBundle, content: str) -> dict:
        """Export bundle as JSON for .humansign file."""
        return {
            "humansign": {
                "version": bundle.version,
                "created_at": bundle.created_at,
                "document_hash": bundle.document_hash,
                "content_hash": bundle.content_hash,
                "metadata": bundle.metadata,
                "signature": bundle.signature,
                "verification_url": bundle.verification_url
            },
            "content": content
        }


# Singleton instance
crypto_service = CryptoService()
