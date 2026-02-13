import os
from dotenv import load_dotenv
import google.generativeai as genai
import asyncio

load_dotenv('backend/.env')

async def test_api():
    api_key = os.environ.get('GOOGLE_API_KEY')
    print(f"API Key present: {bool(api_key)}")
    if not api_key:
        print("CRITICAL: No API Key found")
        return

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-flash-latest')
        response = await model.generate_content_async("Hello, is the API working?")
        print(f"Success! Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_api())
