import os


os.environ["CHATBI_AI_PROVIDER"] = "rule"
os.environ.pop("CHATBI_OPENAI_BASE_URL", None)
os.environ.pop("CHATBI_OPENAI_API_KEY", None)
os.environ["CHATBI_AI_ORCH_DB_PATH"] = os.path.join(os.getcwd(), ".runtime", "test-ai-orch.db")
if os.path.exists(os.environ["CHATBI_AI_ORCH_DB_PATH"]):
  os.remove(os.environ["CHATBI_AI_ORCH_DB_PATH"])
