"""
RAG engine — uses lightweight BM25 keyword retriever (pure Python, ~0MB RAM).
No ChromaDB, no sentence-transformers, no torch. Works on Render free tier.
"""
import os
import re
from langchain_mistralai import ChatMistralAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from core.vector_store import build_retriever


def get_llm():
    return ChatMistralAI(
        model="open-mistral-nemo",
        mistral_api_key=os.getenv("MISTRAL_API_KEY"),
        temperature=0.3,
    )


def format_docs(docs):
    return "\n\n".join([doc.page_content for doc in docs])


def build_rag_chain(transcript: str):
    """Build the BM25-based RAG chain from a transcript."""
    retriever = build_retriever(transcript, k=4)
    llm = get_llm()
    prompt = ChatPromptTemplate.from_messages([(
        "system",
        """You are an expert video content assistant. Answer the user's question
based ONLY on the video transcript context provided below.

CRITICAL RULES:
- NEVER use the word 'meeting'. This is a VIDEO transcript, not a meeting.
- Do NOT add any heading or title to your answer.
- Do NOT use markdown formatting (no **bold**, no *italic*, no ### headings).
- Just answer directly in plain text.

If the answer is not found in the context, say:
"I could not find this information in the video transcript."

Always be concise and precise. If quoting someone, mention it clearly.

Context from video transcript:
{context}""",
    ), ("human", "{question}")])

    rag_chain = (
        {"context": retriever | RunnableLambda(format_docs),
         "question": RunnablePassthrough()}
        | prompt | llm | StrOutputParser()
    )
    return rag_chain


def ask_question(rag_chain, question: str) -> str:
    """Ask a question to the RAG chain."""
    print(f"Question: {question}")
    answer = rag_chain.invoke(question)
    # Safety-net: strip meeting language and markdown
    answer = re.sub(r'\bMeeting\b', 'Video', answer)
    answer = re.sub(r'\bmeeting\b', 'video', answer)
    answer = re.sub(r'^#{1,3}\s+', '', answer, flags=re.MULTILINE)
    answer = re.sub(r'\*\*(.+?)\*\*', r'\1', answer)
    print(f"Answer: {answer}")
    return answer
