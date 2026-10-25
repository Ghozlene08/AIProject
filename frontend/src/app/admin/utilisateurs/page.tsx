"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ArrowRight, Lock, MapPin, Repeat, UserCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { fmtRelative } from "@/lib/format";
import { Badge, Card, CardHeader, ErrorBox, Spinner, Tabs, cx } from "@/components/ui";
import { BLUE_RAMP, DonutChart, LineChart, SERIES } from "@/components/admin/charts";
import { AdminHeader, Delta, InfoTip, dayLabel, fmtNum, usePeriod } from "../shared";
import type { UsersStats } from "../types";

const STATUS = {
  actif: { label: "Actif", tone: "ok" as const, color: "#1f9d5c" },
  inactif: { label: "Inactif", tone: "warn" as const, color: "#f59e0b" },
  jamais_active: { label: "Jamais activé", tone: "muted" as const, color: "#94a3b8" },
};

export default function UtilisateursPage() {
  const { days } = usePeriod();
  const { data, loading, error } = useApi<UsersStats>(`/admin/users-stats?days=${days}`);
  const [filter, setFilter] = useState<"tous" | "actif" | "inactif" | "jamais_active">("tous");

  if (loading && !data) return <Spinner label="Analyse des comptes…" />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const k = data.kpis;
  const rows = filter === "tous" ? data.seniors : data.seniors.filter((s) => s.status === filter);
  const maxNew = Math.max(1, ...data.newPerDay.map((d) => d.count));

  return (
    <div className={cx("fade-up space-y-6", loading && "opacity-60")}>
      <AdminHeader title="Utilisateurs" subtitle="Adoption et activité des comptes, dans le respect de la vie privée des seniors">
        <Link href="/admin/configuration#comptes" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700">
          Gérer les comptes <ArrowRight className="h-4 w-4" />
        </Link>
      </AdminHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat icon={Activity} label="Seniors actifs" value={String(k.activeSeniors.value)} extra={<Delta value={k.activeSeniors.delta} />} def="Seniors distincts ayant réalisé au moins une action sur la période." />
        <Stat icon={UserPlus} label="Nouveaux profils" value={String(k.newProfiles.value)} extra={<Delta value={k.newProfiles.delta} />} def="Profils seniors créés par les aidants pendant la période." />
        <Stat icon={UserCheck} label="Taux d'activation" value={`${fmtNum(k.activationRate.value)} %`} def="Profils ayant réalisé une première action ÷ profils créés." />
        <Stat icon={Repeat} label="Rétention à 7 jours" value={`${fmtNum(k.retention7.value)} %`} extra={<span className="text-xs text-muted">cohorte : {k.retention7.cohort}</span>} def="Seniors activés depuis plus de 7 jours et revenus au cours des 7 derniers jours." />
        <Stat icon={Users} label="Aidants par senior" value={fmtNum(k.caregiversPerSenior.value)} def="Nombre moyen d'aidants rattachés à un profil senior." />
        <Stat icon={UserMinus} label="Comptes inactifs" value={String(k.inactiveAccounts.value)} def={`Seniors sans action depuis ${data.inactivityDays} jours (ou jamais activés) et aidants sans connexion depuis ${data.inactivityDays} jours.`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Seniors actifs par jour" subtitle="Seniors distincts ayant utilisé l'application chaque jour" icon={<Activity className="h-5 w-5" />} />
          <div className="px-3 pb-2">
            <LineChart height={220} labels={data.activeSeries.map((d) => dayLabel(d.date))} series={[{ key: "a", label: "Seniors actifs", color: SERIES[0], values: data.activeSeries.map((d) => d.activeSeniors) }]} />
          </div>
          <div className="border-t border-line px-5 py-4">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">Nouveaux profils par jour</p>
            <div className="flex h-14 items-end gap-[2px]" role="img" aria-label="Nouveaux profils par jour">
              {data.newPerDay.map((d) => (
                <div key={d.date} className="flex-1 rounded-t-[3px] bg-brand-500" style={{ height: `${(d.count / maxNew) * 100}%`, minHeight: d.count ? 4 : 1, opacity: d.count ? 1 : 0.15 }} title={`${dayLabel(d.date)} : ${d.count}`} />
              ))}
            </div>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader title="Statut des profils seniors" subtitle={`Inactif : aucune action depuis ${data.inactivityDays} jours`} icon={<UserCheck className="h-5 w-5" />} />
            <div className="px-5 pb-5">
              <DonutChart
                size={140}
                centerValue={String(data.seniors.length)}
                centerLabel="profils"
                items={data.statusBreakdown.map((s) => ({ key: s.status, label: STATUS[s.status].label, value: s.count, color: STATUS[s.status].color }))}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Fréquence d'utilisation" subtitle="Part des jours où chaque senior actif a utilisé l'application" icon={<Repeat className="h-5 w-5" />} />
            <ul className="space-y-3 px-5 pb-5">
              {data.recurrence.map((r, i) => {
                const total = data.recurrence.reduce((s, x) => s + x.count, 0) || 1;
                return (
                  <li key={r.label} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
                    <span className="font-semibold text-ink">{r.label}</span>
                    <div className="h-3 rounded-full bg-canvas">
                      <div className="h-3 rounded-full" style={{ width: `${(r.count / total) * 100}%`, background: BLUE_RAMP[3 + i] }} title={r.detail} />
                    </div>
                    <b className="text-right text-ink">{r.count}</b>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
            <div>
              <h2 className="text-[15px] font-bold text-ink">Profils seniors</h2>
              <p className="flex items-center gap-1 text-xs text-muted">
                <Lock className="h-3 w-3" /> Aucune donnée médicale ; noms abrégés selon les réglages de confidentialité
              </p>
            </div>
            <Tabs
              value={filter}
              onChange={setFilter}
              items={[
                { value: "tous", label: "Tous", count: data.seniors.length },
                { value: "actif", label: "Actifs", count: data.statusBreakdown.find((s) => s.status === "actif")?.count },
                { value: "inactif", label: "Inactifs", count: data.statusBreakdown.find((s) => s.status === "inactif")?.count },
                { value: "jamais_active", label: "Jamais activés", count: data.statusBreakdown.find((s) => s.status === "jamais_active")?.count },
              ]}
            />
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-canvas text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5">Senior</th>
                  <th className="px-3 py-2.5">Ville</th>
                  <th className="px-3 py-2.5 text-right">Aidants</th>
                  <th className="px-3 py-2.5 text-right">Actions ({data.period.days} j)</th>
                  <th className="px-3 py-2.5">Dernière activité</th>
                  <th className="px-5 py-2.5">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((s) => (
                  <tr key={s._id}>
                    <td className="px-5 py-2.5 font-semibold text-ink">{s.name}</td>
                    <td className="px-3 py-2.5 text-muted">{s.city}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{s.caregivers}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink">{s.actions}</td>
                    <td className="px-3 py-2.5 text-muted">{s.lastActivity ? fmtRelative(s.lastActivity) : "—"}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Répartition des comptes" icon={<Users className="h-5 w-5" />} />
            <div className="px-5 pb-5">
              <DonutChart
                size={140}
                centerValue={String(data.roles.total)}
                centerLabel="comptes"
                items={[
                  { key: "seniors", label: "Seniors", value: data.roles.seniors, color: SERIES[0] },
                  { key: "aidants", label: "Aidants", value: data.roles.aidants, color: SERIES[2] },
                  { key: "admins", label: "Administrateurs", value: data.roles.admins, color: SERIES[5] },
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Seniors par ville"
              icon={<MapPin className="h-5 w-5" />}
              action={<InfoTip>Les villes comptant trop peu de seniors sont regroupées dans « Autres villes » pour éviter toute ré-identification (seuil réglable dans Configuration).</InfoTip>}
            />
            <ul className="space-y-2 px-5 pb-5">
              {data.roles.sites.map((s) => (
                <li key={s.city} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                  <span className="font-semibold text-ink">{s.city}</span>
                  <div className="h-2.5 rounded-full bg-canvas">
                    <div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${s.share ?? 0}%` }} />
                  </div>
                  <span className="text-right text-muted">{s.count}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Aidants sans connexion récente" subtitle={`Aucune connexion depuis ${data.inactivityDays} jours`} icon={<UserMinus className="h-5 w-5" />} />
            <ul className="divide-y divide-line px-5 pb-3">
              {data.inactiveAidants.length === 0 && <li className="py-3 text-sm text-muted">Tous les aidants se sont connectés récemment.</li>}
              {data.inactiveAidants.map((u) => (
                <li key={u._id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold text-ink">{u.name}</span>
                  <span className="text-xs text-muted">{u.lastLoginAt ? `dernière connexion : ${fmtRelative(u.lastLoginAt)}` : "jamais connecté"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, extra, def }: { icon: typeof Users; label: string; value: string; extra?: React.ReactNode; def: string }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
        <Icon className="h-4 w-4 text-brand-600" /> {label}
        <InfoTip>{def}</InfoTip>
      </p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
      <div className="mt-0.5 min-h-5">{extra}</div>
    </Card>
  );
}
