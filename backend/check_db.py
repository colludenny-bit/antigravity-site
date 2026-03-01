import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

async def check_db():
    load_dotenv()
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'karion_trading_os')
    
    print(f"Connecting to {mongo_url}...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    collections = await db.list_collection_names()
    print(f"Found collections: {collections}")
    
    for coll in collections:
        count = await db[coll].count_documents({})
        print(f" - {coll}: {count} documents")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(check_db())
