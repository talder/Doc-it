"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Database as DbIcon, Loader2 } from "lucide-react";
import type { EnhancedTable, DbRow } from "@/lib/types";
import RowEditModal from "@/components/enhanced-table/RowEditModal";

export default function RowDetailPage() {
  const params = useParams<{ slug: string; dbId: string; rowId: string }>();
  const router = useRouter();
  const { slug, dbId, rowId } = params;

  const [db, setDb] = useState<EnhancedTable | null>(null);
  const [row, setRow] = useState<DbRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ username: string; fullName?: string }[]>([]);

  useEffect(() => {
    if (!slug || !dbId) return;
    Promise.all([
      fetch(`/api/spaces/${encodeURIComponent(slug)}/enhanced-tables/${encodeURIComponent(dbId)}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/spaces/${encodeURIComponent(slug)}/members`).then((r) => r.ok ? r.json() : []),
    ])
      .then(([tableData, membersData]) => {
        if (!tableData) { setError("Table not found"); return; }
        setDb(tableData);
        setMembers(membersData || []);
        const foundRow = tableData.rows.find((r: DbRow) => r.id === rowId);
        if (!foundRow) { setError("Row not found"); return; }
        setRow(foundRow);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [slug, dbId, rowId]);

  const handleUpdateRow = async (rid: string, cells: Record<string, unknown>) => {
    await fetch(`/api/spaces/${encodeURIComponent(slug)}/enhanced-tables/${encodeURIComponent(dbId)}/rows/${encodeURIComponent(rid)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cells }),
    });
    // Refresh
    const res = await fetch(`/api/spaces/${encodeURIComponent(slug)}/enhanced-tables/${encodeURIComponent(dbId)}`);
    if (res.ok) {
      const data = await res.json();
      setDb(data);
      setRow(data.rows.find((r: DbRow) => r.id === rowId) || null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-text-muted gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  if (error || !db || !row) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-text-muted gap-3">
        <DbIcon className="w-8 h-8" />
        <p className="text-sm">{error || "Not found"}</p>
        <button onClick={() => router.back()} className="text-accent text-sm hover:underline">← Go back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <RowEditModal
          db={db}
          row={row}
          hiddenColumnIds={[]}
          canWrite={true}
          members={members}
          spaceSlug={slug}
          onUpdateRow={handleUpdateRow}
          onDeleteRow={async (rid) => {
            await fetch(`/api/spaces/${encodeURIComponent(slug)}/enhanced-tables/${encodeURIComponent(dbId)}/rows/${encodeURIComponent(rid)}`, { method: "DELETE" });
            router.back();
          }}
          onDuplicateRow={() => {}}
          onClose={() => router.back()}
        />
      </div>
    </div>
  );
}
