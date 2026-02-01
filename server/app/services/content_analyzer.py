"""
Content Analysis Module for AI Detection.

This module analyzes text content to detect AI-generated vs human-written text
based on statistical features like:
- Vocabulary diversity (unique words / total words)
- Sentence length variation (humans are more variable)
- Word length distribution
- Burstiness (repetition patterns)
- Perplexity proxy (uncommon word usage)
- N-gram repetition (AI tends to repeat phrases)

Human text is typically MORE random and variable.
AI text is typically MORE uniform and predictable.
"""

import math
import re
from collections import Counter
from typing import Any
import numpy as np


class ContentAnalyzer:
    """Analyzes text content for AI vs human detection."""
    
    # Common English words (simplified stop words)
    STOP_WORDS = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
        'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
        'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where', 'why',
        'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
        'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
        'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'if'
    }
    
    def __init__(self):
        pass
    
    def tokenize(self, text: str) -> list[str]:
        """Simple word tokenization."""
        # Remove special characters, keep alphanumeric and apostrophes
        text = text.lower()
        words = re.findall(r"[a-z]+(?:'[a-z]+)?", text)
        return words
    
    def get_sentences(self, text: str) -> list[str]:
        """Split text into sentences."""
        # Split on sentence-ending punctuation
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def extract_features(self, text: str) -> dict[str, Any]:
        """
        Extract content analysis features from text.
        
        Returns features that can distinguish AI vs human text:
        - Human text: higher variation, more randomness, unique phrasing
        - AI text: more uniform, predictable patterns, repetitive structure
        """
        if not text or len(text) < 50:
            return self._empty_features()
        
        words = self.tokenize(text)
        sentences = self.get_sentences(text)
        
        if len(words) < 10:
            return self._empty_features()
        
        features = {}
        
        # === VOCABULARY FEATURES ===
        word_counts = Counter(words)
        unique_words = len(word_counts)
        total_words = len(words)
        
        # Type-Token Ratio (vocabulary diversity)
        # Higher = more diverse vocabulary (more human-like)
        features['vocabulary_diversity'] = unique_words / total_words
        
        # Hapax Legomena ratio (words appearing only once)
        # Higher = more unique expressions (more human-like)
        hapax = sum(1 for count in word_counts.values() if count == 1)
        features['hapax_ratio'] = hapax / unique_words if unique_words > 0 else 0
        
        # Content word ratio (non-stop-words)
        content_words = [w for w in words if w not in self.STOP_WORDS]
        features['content_word_ratio'] = len(content_words) / total_words
        
        # === SENTENCE FEATURES ===
        if sentences:
            sentence_lengths = [len(self.tokenize(s)) for s in sentences]
            
            # Sentence length mean and std
            features['avg_sentence_length'] = float(np.mean(sentence_lengths))
            features['sentence_length_std'] = float(np.std(sentence_lengths))
            
            # Sentence length variation coefficient
            # Higher = more varied sentence structure (more human-like)
            if features['avg_sentence_length'] > 0:
                features['sentence_length_cv'] = float(features['sentence_length_std'] / features['avg_sentence_length'])
            else:
                features['sentence_length_cv'] = 0.0
        else:
            features['avg_sentence_length'] = 0.0
            features['sentence_length_std'] = 0.0
            features['sentence_length_cv'] = 0.0
        
        # === WORD LENGTH FEATURES ===
        word_lengths = [len(w) for w in words]
        features['avg_word_length'] = float(np.mean(word_lengths))
        features['word_length_std'] = float(np.std(word_lengths))
        
        # Word length variation
        if features['avg_word_length'] > 0:
            features['word_length_cv'] = float(features['word_length_std'] / features['avg_word_length'])
        else:
            features['word_length_cv'] = 0.0
        
        # === BURSTINESS FEATURES ===
        # Measure how "bursty" word usage is (humans tend to be more bursty)
        features['burstiness'] = float(self._calculate_burstiness(words))
        
        # === N-GRAM REPETITION ===
        # AI text tends to have more repeated phrases
        features['bigram_repetition'] = float(self._calculate_ngram_repetition(words, 2))
        features['trigram_repetition'] = float(self._calculate_ngram_repetition(words, 3))
        
        # === ENTROPY ===
        # Character-level entropy (randomness measure)
        features['char_entropy'] = float(self._calculate_entropy(text))
        
        # Word-level entropy
        features['word_entropy'] = float(self._calculate_word_entropy(words))
        
        # === PUNCTUATION FEATURES ===
        features['punctuation_ratio'] = float(self._calculate_punctuation_ratio(text))
        
        # === RARE WORD USAGE ===
        # Proxy for perplexity - uncommon words
        features['long_word_ratio'] = float(sum(1 for w in words if len(w) > 8) / total_words)
        
        # === COMPUTE FINAL SCORE ===
        features['human_score'] = float(self._compute_human_score(features))
        
        return features
    
    def _calculate_burstiness(self, words: list[str]) -> float:
        """
        Calculate burstiness of word usage.
        Human text tends to have "bursty" patterns where certain words
        cluster together, while AI text is more uniform.
        """
        if len(words) < 20:
            return 0.0
        
        word_counts = Counter(words)
        
        # For words appearing multiple times, calculate inter-arrival times
        bursts = []
        for word, count in word_counts.items():
            if count >= 2:
                positions = [i for i, w in enumerate(words) if w == word]
                if len(positions) >= 2:
                    intervals = [positions[i+1] - positions[i] for i in range(len(positions)-1)]
                    if intervals:
                        mean_interval = np.mean(intervals)
                        std_interval = np.std(intervals)
                        if mean_interval > 0:
                            # Coefficient of variation of intervals
                            bursts.append(std_interval / mean_interval)
        
        return np.mean(bursts) if bursts else 0.0
    
    def _calculate_ngram_repetition(self, words: list[str], n: int) -> float:
        """Calculate n-gram repetition ratio (lower = more repetitive = more AI-like)."""
        if len(words) < n + 1:
            return 1.0
        
        ngrams = [tuple(words[i:i+n]) for i in range(len(words) - n + 1)]
        unique_ngrams = len(set(ngrams))
        total_ngrams = len(ngrams)
        
        return unique_ngrams / total_ngrams if total_ngrams > 0 else 1.0
    
    def _calculate_entropy(self, text: str) -> float:
        """Calculate Shannon entropy of character distribution."""
        text = text.lower()
        char_counts = Counter(text)
        total = len(text)
        
        if total == 0:
            return 0.0
        
        entropy = 0.0
        for count in char_counts.values():
            p = count / total
            if p > 0:
                entropy -= p * math.log2(p)
        
        return entropy
    
    def _calculate_word_entropy(self, words: list[str]) -> float:
        """Calculate Shannon entropy of word distribution."""
        if not words:
            return 0.0
        
        word_counts = Counter(words)
        total = len(words)
        
        entropy = 0.0
        for count in word_counts.values():
            p = count / total
            if p > 0:
                entropy -= p * math.log2(p)
        
        return entropy
    
    def _calculate_punctuation_ratio(self, text: str) -> float:
        """Calculate ratio of punctuation to total characters."""
        if not text:
            return 0.0
        
        punctuation = sum(1 for c in text if c in '.,!?;:"-\'()[]{}')
        return punctuation / len(text)
    
        return min(1.0, max(0.0, score))
    
    def _compute_human_score(self, features: dict[str, float]) -> float:
        """
        Compute a composite human-likeness score (0-1).
        Higher score = more likely human.
        """
        score = 0.0
        total_weight = 0.0
        
        # Vocabulary diversity (weight: 0.15)
        # Human: typically 0.4-0.7
        vocab_score = min(1.0, features['vocabulary_diversity'] / 0.6)
        score += 0.15 * vocab_score
        total_weight += 0.15
        
        # Sentence length variation (weight: 0.15)
        # Only count if we have multiple sentences
        if features['avg_sentence_length'] > 0:
            cv_score = min(1.0, features['sentence_length_cv'] / 0.5)
            score += 0.20 * cv_score  # Increased weight
            total_weight += 0.20
        
        # Burstiness (weight: 0.15)
        # Only count if we have enough words
        if features['burstiness'] > 0:
            burst_score = min(1.0, features['burstiness'] / 1.0)
            score += 0.15 * burst_score
            total_weight += 0.15
        
        # Bigram uniqueness (weight: 0.15)
        bigram_score = min(1.0, features['bigram_repetition'] / 0.9)
        score += 0.15 * bigram_score
        total_weight += 0.15
        
        # Trigram uniqueness (weight: 0.15)
        trigram_score = min(1.0, features['trigram_repetition'] / 0.95)
        score += 0.15 * trigram_score
        total_weight += 0.15
        
        # Word entropy (weight: 0.15)
        entropy_score = min(1.0, (features['word_entropy'] - 4) / 4) if features['word_entropy'] > 4 else 0
        score += 0.15 * max(0, entropy_score)
        total_weight += 0.15
        
        # Normalize score based on active weights
        if total_weight > 0:
            final_score = score / total_weight
        else:
            final_score = 0.5
            
        return min(1.0, max(0.0, final_score))
    
    def _empty_features(self) -> dict[str, Any]:
        """Return empty features for insufficient text."""
        return {
            'vocabulary_diversity': 0.0,
            'hapax_ratio': 0.0,
            'content_word_ratio': 0.0,
            'avg_sentence_length': 0.0,
            'sentence_length_std': 0.0,
            'sentence_length_cv': 0.0,
            'avg_word_length': 0.0,
            'word_length_std': 0.0,
            'word_length_cv': 0.0,
            'burstiness': 0.0,
            'bigram_repetition': 0.0,
            'trigram_repetition': 0.0,
            'char_entropy': 0.0,
            'word_entropy': 0.0,
            'punctuation_ratio': 0.0,
            'long_word_ratio': 0.0,
            'human_score': 0.0,
        }
    
    def classify(self, text: str) -> dict[str, Any]:
        """
        Classify text as human or AI-generated.
        
        Returns:
            dict with:
                - is_human: bool
                - confidence: float (0-1)
                - human_score: float (0-1)
                - features: dict of all extracted features
                - verdict: str ('human', 'ai_generated', 'uncertain')
        """
        features = self.extract_features(text)
        
        human_score = features.get('human_score', 0.0)
        
        # Classification thresholds
        if human_score >= 0.65:
            verdict = 'human'
            is_human = True
            confidence = min(0.95, 0.5 + (human_score - 0.65) * 1.5)
        elif human_score <= 0.35:
            verdict = 'ai_generated'
            is_human = False
            confidence = min(0.95, 0.5 + (0.35 - human_score) * 1.5)
        else:
            verdict = 'uncertain'
            is_human = bool(human_score > 0.5)
            confidence = 0.5 + abs(human_score - 0.5) * 0.5
        
        return {
            'is_human': is_human,
            'confidence': confidence,
            'human_score': human_score,
            'verdict': verdict,
            'features': features,
        }


# Singleton instance
content_analyzer = ContentAnalyzer()
