import litellm
import os
from dotenv import load_dotenv

load_dotenv()

os.environ["GEMINI_API_VERSION"] = "v1"
print(f"GEMINI_API_VERSION: {os.environ.get('GEMINI_API_VERSION')}")

models_to_try = [
    'google_ai/gemini-1.5-flash',
    'gemini/gemini-1.5-flash'
]

for model_name in models_to_try:
    print(f"\nTrying LiteLLM model: {model_name} with base_url")
    try:
        response = litellm.completion(
            model=model_name,
            messages=[{"role": "user", "content": "Say Hello"}],
            api_key=os.getenv("GEMINI_API_KEY"),
            base_url="https://generativelanguage.googleapis.com/v1"
        )
        print(f"Success with {model_name}: {response.choices[0].message.content}")
        break
    except Exception as e:
        print(f"Failed with {model_name}: {e}")
