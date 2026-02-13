import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from multi_source_engine import MultiSourceEngine
async def run_test():
    print("Testing Multi-Source Engine...")
    engine = MultiSourceEngine()
    cards = await engine.run_analysis()
    
    print("\n--- RESULTS ---")
    for card in cards:
        print(f"\nAsset: {card.asset}")
        print(f"Direction: {card.direction} ({card.probability}%)")
        print(f"Impulse: {card.impulse}")
        print(f"Drivers: {', '.join(card.drivers)}")
        print(f"Scores: {card.scores}")

if __name__ == "__main__":
    asyncio.run(run_test())
