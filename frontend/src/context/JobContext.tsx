import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { JobStatus } from "../api";

interface JobContextType {
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
  jobStatus: JobStatus | null;
  setJobStatus: (status: JobStatus | null) => void;
  chatJobId: string | null;
  setChatJobId: (id: string | null) => void;
}

const JobContext = createContext<JobContextType | null>(null);

export function JobProvider({ children }: { children: ReactNode }) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [chatJobId, setChatJobId] = useState<string | null>(null);

  return (
    <JobContext.Provider
      value={{
        activeJobId,
        setActiveJobId,
        jobStatus,
        setJobStatus,
        chatJobId,
        setChatJobId,
      }}
    >
      {children}
    </JobContext.Provider>
  );
}

export function useJob() {
  const ctx = useContext(JobContext);
  if (!ctx) throw new Error("useJob must be used within JobProvider");
  return ctx;
}