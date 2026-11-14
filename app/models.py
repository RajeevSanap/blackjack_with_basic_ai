"""
Blackjack Game Models
Deck, Player, and Game classes with probability-based AI logic.
"""

import random


SUITS = ['♠', '♥', '♦', '♣']
RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']


def card_value(rank: str) -> int:
    """Return the base integer value of a card rank (Ace = 11 initially)."""
    if rank in ('J', 'Q', 'K'):
        return 10
    if rank == 'A':
        return 11
    return int(rank)


class Card:
    def __init__(self, suit: str, rank: str):
        self.suit = suit
        self.rank = rank
        self.value = card_value(rank)

    def to_dict(self) -> dict:
        return {'suit': self.suit, 'rank': self.rank, 'value': self.value}

    def __repr__(self):
        return f"{self.rank}{self.suit}"


class Deck:
    def __init__(self, num_decks: int = 1):
        self.num_decks = num_decks
        self.cards: list[Card] = []
        self.build()

    def build(self):
        self.cards = [
            Card(suit, rank)
            for _ in range(self.num_decks)
            for suit in SUITS
            for rank in RANKS
        ]
        random.shuffle(self.cards)

    def draw(self) -> Card:
        if not self.cards:
            self.build()
        return self.cards.pop()

    def remaining_count(self) -> int:
        return len(self.cards)

    def to_dict(self) -> list[dict]:
        return [c.to_dict() for c in self.cards]


class Hand:
    def __init__(self):
        self.cards: list[Card] = []

    def add_card(self, card: Card):
        self.cards.append(card)

    def score(self) -> int:
        total = sum(c.value for c in self.cards)
        aces = sum(1 for c in self.cards if c.rank == 'A')
        # Convert Ace from 11→1 as needed to avoid bust
        while total > 21 and aces:
            total -= 10
            aces -= 1
        return total

    def is_bust(self) -> bool:
        return self.score() > 21

    def is_blackjack(self) -> bool:
        return len(self.cards) == 2 and self.score() == 21

    def to_dict(self, hide_second: bool = False) -> list[dict]:
        result = []
        for i, card in enumerate(self.cards):
            if hide_second and i == 1:
                result.append({'suit': '?', 'rank': '?', 'value': 0, 'hidden': True})
            else:
                d = card.to_dict()
                d['hidden'] = False
                result.append(d)
        return result


class AIDealer:
    """
    Probability-based AI Dealer.

    Decision rules:
      - score < 12  → always HIT
      - score >= 17 → always STAND
      - else: compute bust_probability = bust_cards / remaining_cards
        * bust_probability < 0.4 → HIT
        * bust_probability >= 0.4 → STAND
    """

    def compute_bust_probability(self, hand: Hand, deck: Deck) -> float:
        """Calculate probability that next drawn card causes a bust.

        Accounts for soft Aces already in the hand — each soft Ace
        can be demoted from 11→1 to absorb an extra 10 points before
        the hand actually busts.
        """
        remaining = deck.cards
        if not remaining:
            return 0.0

        current_score = hand.score()
        # Count how many Aces are still "soft" (counted as 11)
        raw_total = sum(c.value for c in hand.cards)
        aces_total = sum(1 for c in hand.cards if c.rank == 'A')
        # The number of aces already demoted by Hand.score()
        demoted = 0
        tmp = raw_total
        a = aces_total
        while tmp > 21 and a:
            tmp -= 10
            a -= 1
            demoted += 1
        soft_aces = aces_total - demoted  # Aces still counted as 11

        bust_count = 0
        for card in remaining:
            card_val = card.value  # Ace = 11
            new_total = current_score + card_val
            # The drawn card itself can be soft
            if new_total > 21 and card.rank == 'A':
                new_total -= 10  # Use drawn Ace as 1
            # Existing soft Aces in hand can also be demoted
            available_demotions = soft_aces
            while new_total > 21 and available_demotions > 0:
                new_total -= 10
                available_demotions -= 1
            if new_total > 21:
                bust_count += 1

        return bust_count / len(remaining)

    def decide(self, hand: Hand, deck: Deck) -> dict:
        """
        Return decision dict:
          {
            'action': 'HIT' | 'STAND',
            'score': int,
            'bust_probability': float,
            'reason': str
          }
        """
        score = hand.score()
        bust_prob = self.compute_bust_probability(hand, deck)

        if score < 12:
            action = 'HIT'
            reason = f"Score {score} < 12 → always HIT"
        elif score >= 17:
            action = 'STAND'
            reason = f"Score {score} ≥ 17 → always STAND"
        else:
            if bust_prob < 0.4:
                action = 'HIT'
                reason = (
                    f"Bust probability {bust_prob:.1%} < 40% → HIT"
                )
            else:
                action = 'STAND'
                reason = (
                    f"Bust probability {bust_prob:.1%} ≥ 40% → STAND"
                )

        return {
            'action': action,
            'score': score,
            'bust_probability': round(bust_prob, 4),
            'bust_probability_pct': f"{bust_prob * 100:.1f}%",
            'reason': reason,
        }

def _visible_dealer_score(dealer_hand: Hand) -> int:
    """Score of only the first (visible) dealer card. Ace = 11."""
    return dealer_hand.cards[0].value


class Game:
    """Manages the full game flow."""

    STATUS_PLAYING = 'playing'
    STATUS_DEALER_TURN = 'dealer_turn'
    STATUS_FINISHED = 'finished'

    def __init__(self):
        self.deck = Deck()
        self.player_hand = Hand()
        self.dealer_hand = Hand()
        self.ai = AIDealer()
        self.status = self.STATUS_PLAYING
        self.result: str | None = None  # 'player_win', 'dealer_win', 'draw'
        self.dealer_steps: list[dict] = []  # AI reasoning steps
        self._deal_initial()

    def _deal_initial(self):
        self.player_hand.add_card(self.deck.draw())
        self.dealer_hand.add_card(self.deck.draw())
        self.player_hand.add_card(self.deck.draw())
        self.dealer_hand.add_card(self.deck.draw())

        # Check immediate blackjack
        if self.player_hand.is_blackjack() and self.dealer_hand.is_blackjack():
            self.status = self.STATUS_FINISHED
            self.result = 'draw'
        elif self.player_hand.is_blackjack():
            self.status = self.STATUS_FINISHED
            self.result = 'player_win'
        elif self.dealer_hand.is_blackjack():
            self.status = self.STATUS_FINISHED
            self.result = 'dealer_win'

    def player_hit(self) -> dict:
        """Player draws a card. Returns updated state."""
        if self.status != self.STATUS_PLAYING:
            return self.get_state()

        card = self.deck.draw()
        self.player_hand.add_card(card)

        if self.player_hand.is_bust():
            self.status = self.STATUS_FINISHED
            self.result = 'dealer_win'
        elif self.player_hand.score() == 21:
            # Auto-stand on 21
            self._run_dealer_turn()

        return self.get_state()

    def player_stand(self) -> dict:
        """Player stands; dealer plays out their turn."""
        if self.status != self.STATUS_PLAYING:
            return self.get_state()
        self._run_dealer_turn()
        return self.get_state()

    def _run_dealer_turn(self):
        self.status = self.STATUS_DEALER_TURN
        self.dealer_steps = []

        while True:
            decision = self.ai.decide(self.dealer_hand, self.deck)
            step = {
                'action': decision['action'],
                'score': decision['score'],
                'bust_probability': decision['bust_probability'],
                'bust_probability_pct': decision['bust_probability_pct'],
                'reason': decision['reason'],
                'card_drawn': None,
            }

            if decision['action'] == 'HIT':
                card = self.deck.draw()
                self.dealer_hand.add_card(card)
                step['card_drawn'] = card.to_dict()
                self.dealer_steps.append(step)

                if self.dealer_hand.is_bust():
                    break
            else:
                self.dealer_steps.append(step)
                break

        self.status = self.STATUS_FINISHED
        self._determine_result()

    def _determine_result(self):
        player_score = self.player_hand.score()
        dealer_score = self.dealer_hand.score()

        if self.dealer_hand.is_bust():
            self.result = 'player_win'
        elif player_score > dealer_score:
            self.result = 'player_win'
        elif dealer_score > player_score:
            self.result = 'dealer_win'
        else:
            self.result = 'draw'

    def get_state(self, reveal_dealer: bool = False) -> dict:
        """
        Returns the serializable game state.
        Dealer's second card is hidden until the game is finished or explicitly revealed.
        """
        game_over = self.status == self.STATUS_FINISHED
        hide = not game_over and not reveal_dealer

        return {
            'status': self.status,
            'result': self.result,
            'player': {
                'cards': self.player_hand.to_dict(),
                'score': self.player_hand.score(),
                'is_bust': self.player_hand.is_bust(),
                'is_blackjack': self.player_hand.is_blackjack(),
            },
            'dealer': {
                'cards': self.dealer_hand.to_dict(hide_second=hide),
                'score': self.dealer_hand.score() if not hide else _visible_dealer_score(self.dealer_hand),
                'is_bust': self.dealer_hand.is_bust() if not hide else False,
                'is_blackjack': self.dealer_hand.is_blackjack() if not hide else False,
            },
            'deck_remaining': self.deck.remaining_count(),
            'dealer_steps': self.dealer_steps,
        }
