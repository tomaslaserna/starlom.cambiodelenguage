type MetricIconProps = {
  name:
    | "alert"
    | "calendar"
    | "document"
    | "money"
    | "purchase"
    | "receipt"
    | "sales"
    | "result"
    | "costs"
    | "stock"
    | "wallet";
};

export function MetricIcon({ name }: MetricIconProps) {
  if (name === "sales") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "result") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="m4 16 5-5 4 3 7-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M15 6h5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "costs") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M4 7.5h14a2 2 0 0 1 2 2v8.5H6a2 2 0 0 1-2-2V7.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M4 8V6a2 2 0 0 1 2-2h11v3.5M16 12h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "document") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M6 3h8l4 4v14H6V3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M14 3v5h5M9 12h6M9 16h6" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "money") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v12" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "receipt") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "wallet") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M4 7h14a2 2 0 0 1 2 2v10H6a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M4 8V6a2 2 0 0 1 2-2h11v3M16 12h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M5 5h14v15H5V5ZM8 3v4M16 3v4M5 9h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="m9 14 2 2 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "purchase") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M6 8h12l1 13H5L6 8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "alert") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v6M12 17h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="m4 7 8-4 8 4-8 4-8-4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}
