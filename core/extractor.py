#Actionableitems , decision , questions 

from langchain_mistralai import ChatMistralAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
import os 


def get_llm():
    return ChatMistralAI(model = "mistral-small-latest", mistral_api_key = os.getenv("MISTRAL_API_KEY"),temperature=0.2)



def build_chain(system_prompt : str):
    llm = get_llm()
    return (
        RunnablePassthrough() | RunnableLambda(lambda x : {"text" : x}) |ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human","{text}"),
    ]) | llm |StrOutputParser()
    )

def extract_action_items(transcript:str)->str:
    chain = build_chain(
         "You are an expert video content analyst. From the video transcript, "
        "extract all action items or tasks mentioned. For each provide:\n"
        "- Task description\n"
        "- Who is responsible (if mentioned)\n"
        "- Deadline/timeline (if mentioned, else write 'Not specified')\n\n"
        "CRITICAL: NEVER use the word 'meeting'. This is a VIDEO, not a meeting.\n"
        "Format as a numbered list. Do NOT add a heading or title. "
        "Do NOT use markdown formatting (no **bold**, no *italic*). "
        "If none found say 'No action items found.'"
    )

    return chain.invoke(transcript)


def extract_key_decisions(transcript: str) -> str:
    chain = build_chain(
        "You are an expert video content analyst. From the video transcript, "
        "extract all key decisions or conclusions made. "
        "CRITICAL: NEVER use the word 'meeting'. This is a VIDEO, not a meeting. "
        "Format as a numbered list. Do NOT add a heading or title. "
        "Do NOT use markdown formatting (no **bold**, no *italic*). "
        "If none found say 'No key decisions found.'"
    )
    return chain.invoke(transcript)


def extract_questions(transcript: str) -> str:
    chain = build_chain(
        "From the video transcript, extract all unresolved questions "
        "or topics needing further exploration. "
        "CRITICAL: NEVER use the word 'meeting'. This is a VIDEO, not a meeting. "
        "Format as a numbered list. Do NOT add a heading or title. "
        "Do NOT use markdown formatting (no **bold**, no *italic*). "
        "If none found say 'No open questions found.'"
    )
    return chain.invoke(transcript)