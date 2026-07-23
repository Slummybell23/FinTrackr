import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Category, Vendor } from "../lib/types";

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api.vendors().then(setVendors).catch(() => {});
    api.categories().then(setCategories).catch(() => {});
  }, []);

  function editLocal(id: number, patch: Partial<Vendor>) {
    setVendors((all) => all.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  async function save(vendor: Vendor) {
    await api
      .updateVendor(vendor.id, {
        name: vendor.name,
        alias: vendor.alias,
        defaultCategoryId: vendor.defaultCategoryId,
      })
      .catch(() => {});
  }

  async function remove(vendor: Vendor) {
    if (!window.confirm(`Forget "${vendor.name}"? Its entries stay, unfiled.`)) return;
    await api.deleteVendor(vendor.id).catch(() => {});
    setVendors((all) => all.filter((v) => v.id !== vendor.id));
  }

  async function merge(vendor: Vendor, targetId: number) {
    const target = vendors.find((v) => v.id === targetId);
    if (!target) return;
    if (!window.confirm(`Fold "${vendor.name}" into "${target.name}"? Its entries move over.`))
      return;
    await api.mergeVendors(vendor.id, targetId).catch(() => {});
    const refreshed = await api.vendors().catch(() => null);
    if (refreshed) setVendors(refreshed);
  }

  const field =
    "field-sm";

  return (
    <div className="lg:max-w-2xl">
      <header className="mb-8">
        <Link to="/you" className="text-sm text-ink-faint">
          ‹ You
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-light">Vendors</h1>
        <p className="text-sm text-ink-mute">Mark once, filed forever.</p>
      </header>

      {vendors.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-faint">
          Vendors appear as you write entries.
        </p>
      ) : (
        <ul className="space-y-4">
          {vendors.map((vendor) => (
            <li key={vendor.id} className="card p-3">
              <div className="flex items-center gap-2">
                <input
                  className={`${field} flex-1`}
                  value={vendor.name}
                  onChange={(e) => editLocal(vendor.id, { name: e.target.value })}
                  onBlur={() => save(vendor)}
                  aria-label="Vendor name"
                />
                <button
                  onClick={() => remove(vendor)}
                  className="px-1 text-ink-faint"
                  aria-label={`Forget ${vendor.name}`}
                >
                  ✕
                </button>
              </div>
              <input
                className={`${field} mt-2 w-full`}
                placeholder="Also answers to… e.g. AMZN MKTP US"
                value={vendor.alias ?? ""}
                onChange={(e) => editLocal(vendor.id, { alias: e.target.value || null })}
                onBlur={() => save(vendor)}
                aria-label="Alias"
              />
              <div className="mt-2 flex items-center gap-2">
                <select
                  className={`${field} min-w-0 flex-1`}
                  value={vendor.defaultCategoryId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : null;
                    editLocal(vendor.id, { defaultCategoryId: value });
                    save({ ...vendor, defaultCategoryId: value });
                  }}
                  aria-label="Files into"
                >
                  <option value="">Files nowhere</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      Files into {c.emoji ? `${c.emoji} ` : ""}
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className={`${field} min-w-0 flex-1`}
                  value=""
                  onChange={(e) => e.target.value && merge(vendor, Number(e.target.value))}
                  aria-label="Merge into"
                >
                  <option value="">Merge into…</option>
                  {vendors
                    .filter((v) => v.id !== vendor.id)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </div>
              <Link
                to={`/vendor/${vendor.id}`}
                className="mt-2 inline-block text-xs text-accent"
              >
                See spending over time ›
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
