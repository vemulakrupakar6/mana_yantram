import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./shared";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  empty: string;
}) {
  const { t } = useTranslation();
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {t(column.header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination" aria-label={t("pagination")}>
      <Button
        variant="outline"
        size="small"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t("previous")}
      </Button>
      <span>{t("pageOf", { page, pages, total })}</span>
      <Button
        variant="outline"
        size="small"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        {t("next")}
      </Button>
    </nav>
  );
}
