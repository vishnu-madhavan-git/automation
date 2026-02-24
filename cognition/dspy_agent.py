import dspy
import os
import google.generativeai as genai
from dotenv import load_dotenv
import litellm

# Load environment variables
load_dotenv()

class GoogleAIStudioLM(dspy.LM):
    """Custom DSPy LM for Google AI Studio using the official SDK."""
    def __init__(self, model_name, api_key):
        super().__init__(model_name)
        genai.configure(api_key=api_key)
        self.client = genai.GenerativeModel(model_name)

    def __call__(self, prompt=None, messages=None, **kwargs):
        input_text = prompt if prompt is not None else messages[-1]['content']
        response = self.client.generate_content(input_text)
        return [response.text]

class LiteLLMLM(dspy.LM):
    """Custom DSPy LM using LiteLLM for multi-provider support (Azure, etc.)."""
    def __init__(self, model_name, **kwargs):
        super().__init__(model_name)
        self.model_name = model_name
        self.kwargs = kwargs

    def __call__(self, prompt=None, messages=None, **kwargs):
        input_text = prompt if prompt is not None else messages[-1]['content']
        response = litellm.completion(
            model=self.model_name,
            messages=[{"role": "user", "content": input_text}],
            **self.kwargs
        )
        return [response.choices[0].message.content]

# Configure AI Brain (Preference: Azure -> Gemini)
if os.getenv("AZURE_OPENAI_API_KEY") and os.getenv("AZURE_OPENAI_ENDPOINT"):
    # Azure Brain Configuration
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
    lm_engine = LiteLLMLM(
        model_name=f"azure/{deployment}",
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        api_base=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
    )
    print(f"[*] AI Brain: Azure OpenAI ({deployment})")
else:
    # Fallback to Gemini
    lm_engine = GoogleAIStudioLM('gemini-2.0-flash', api_key=os.getenv("GEMINI_API_KEY"))
    print("[*] AI Brain: Google Gemini (Local/Edge)")

dspy.settings.configure(lm=lm_engine)

class AgenticSignature(dspy.Signature):
    """
    Experimental agentic signature for ZeroClaw ecosystem.
    Takes a user query and returns a structured plan and response.
    """
    history = dspy.InputField(desc="Previous conversation context")
    query = dspy.InputField(desc="User command or question")
    plan = dspy.OutputField(desc="Step-by-step reasoning or tool execution plan")
    answer = dspy.OutputField(desc="Final concise response to the user")

class ZeroClawAgent(dspy.Module):
    def __init__(self):
        super().__init__()
        self.reasoner = dspy.ChainOfThought(AgenticSignature)

    def forward(self, query, history=""):
        prediction = self.reasoner(query=query, history=history)
        return prediction

if __name__ == "__main__":
    import sys
    
    # Check for CLI arguments
    if len(sys.argv) > 1:
        query = sys.argv[1]
        history = sys.argv[2] if len(sys.argv) > 2 else ""
    else:
        # Internal test run
        query = "What is the status of the zero-claw ecosystem?"
        history = ""
        
    agent = ZeroClawAgent()
    print(f"Testing Agent with query: {query}")
    
    try:
        response = agent.forward(query=query, history=history)
        print("\n--- AGENT PLAN ---")
        print(response.plan)
        print("\n--- AGENT ANSWER ---")
        print(response.answer)
    except Exception as e:
        print(f"Error during execution: {e}")
        sys.exit(1)
