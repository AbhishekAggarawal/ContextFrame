"""
Lightweight vector store using BM25 keyword retrieval (pure Python, no GPU/ML deps).
Works on Render's 512MB free tier — no torch, no chromadb, no sentence-transformers.
"""

from langchain_core.documents import Document
from langchain_community.retrievers import BM25Retriever
from langchain_text_splitters import RecursiveCharacterTextSplitter


def build_retriever(transcript: str, k: int = 4) -> BM25Retriever:
    """Split transcript into chunks and return a BM25 retriever."""
    print("Building BM25 retriever...")
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
    )
    chunks = splitter.split_text(transcript)
    docs = [
        Document(page_content=chunk, metadata={"chunk_index": i})
        for i, chunk in enumerate(chunks)
    ]
    retriever = BM25Retriever.from_documents(docs)
    retriever.k = k
    print(f"BM25 retriever ready with {len(docs)} chunks.")
    return retriever
