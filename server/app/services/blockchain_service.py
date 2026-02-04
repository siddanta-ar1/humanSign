"""Blockchain integration service."""

from typing import Optional
from web3 import Web3
from eth_account import Account
import json
from datetime import datetime

from app.config import get_settings


class BlockchainService:
    """Service for interacting with the Polygon blockchain."""

    def __init__(self):
        self._settings = get_settings()
        self._web3 = Web3(Web3.HTTPProvider(self._settings.polygon_rpc_url))
        self._account = None
        
        if self._settings.polygon_private_key:
            self._account = Account.from_key(self._settings.polygon_private_key)

    def is_connected(self) -> bool:
        """Check connection to blockchain provider."""
        return self._web3.is_connected()

    def anchor_session(self, session_hash: str, session_id: str) -> dict:
        """
        Anchor a session hash to the blockchain.
        
        If no private key is configured, returns a mock transaction.
        """
        # MOCK IMPLEMENTATION IF NO KEY
        if not self._account:
            return {
                "tx_hash": f"0xmock{session_hash[:60]}",
                "block_number": 12345678,
                "timestamp": datetime.now().isoformat(),
                "explorer_url": f"https://amoy.polygonscan.com/tx/0xmock{session_hash[:60]}",
                "status": "mock_success"
            }

        # REAL IMPLEMENTATION (simplified for now - just sending 0 value tx with data)
        # In a real app, we would call a smart contract function
        try:
            # Create transaction with session hash in input data
            tx = {
                'to': self._account.address,  # Send to self if no contract
                'value': 0,
                'gas': 21000,
                'gasPrice': self._web3.eth.gas_price,
                'nonce': self._web3.eth.get_transaction_count(self._account.address),
                'chainId': 80002, # Amoy Testnet ID
                'data': self._web3.to_hex(text=f"HumanSign:{session_id}:{session_hash}")
            }
            
            signed_tx = self._web3.eth.account.sign_transaction(tx, self._settings.polygon_private_key)
            tx_hash = self._web3.eth.send_raw_transaction(signed_tx.rawTransaction)
            
            # fast wait for receipt
            receipt = self._web3.eth.wait_for_transaction_receipt(tx_hash, timeout=10)
            
            return {
                "tx_hash": receipt['transactionHash'].hex(),
                "block_number": receipt['blockNumber'],
                "timestamp": datetime.now().isoformat(),
                "explorer_url": f"https://amoy.polygonscan.com/tx/{receipt['transactionHash'].hex()}",
                "status": "success"
            }
        except Exception as e:
            print(f"Blockchain Error: {e}")
            # Fallback to mock in dev if real fails
            return {
                "tx_hash": f"0xmock_error_fallback_{session_hash[:10]}",
                "status": "mock_fallback_on_error",
                "error": str(e)
            }

    def verify_anchor(self, tx_hash: str) -> dict:
        """Verify a transaction on chain."""
        if tx_hash.startswith("0xmock"):
             return {
                "valid": True,
                "timestamp": datetime.now().isoformat(),
                "data": "Mock Verification Data"
            }
            
        try:
            tx = self._web3.eth.get_transaction(tx_hash)
            receipt = self._web3.eth.get_transaction_receipt(tx_hash)
            
            if receipt['status'] == 1:
                # Decode input data
                input_data = self._web3.to_text(hexstr=tx['input'])
                return {
                    "valid": True,
                    "block_number": tx['blockNumber'],
                    "data": input_data,
                    "from": tx['from']
                }
            return {"valid": False, "reason": "Transaction failed"}
        except Exception as e:
             return {"valid": False, "error": str(e)}

blockchain_service = BlockchainService()
