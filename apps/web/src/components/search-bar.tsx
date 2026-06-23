import { Button, Input } from "@/components/ui";

type SearchBarProps = {
  action: string;
  query: string;
  placeholder: string;
};

export function SearchBar({ action, query, placeholder }: SearchBarProps) {
  const inputId = `${action.replace(/[^a-zA-Z0-9]+/g, "-") || "search"}-q`;

  return (
    <form action={action} aria-label="Busqueda" className="flex flex-col gap-3 md:flex-row">
      <label className="sr-only" htmlFor={inputId}>
        Buscar
      </label>
      <Input
        className="flex-1"
        defaultValue={query}
        id={inputId}
        name="q"
        placeholder={placeholder}
        type="search"
      />
      <Button type="submit">
        Buscar
      </Button>
    </form>
  );
}
