function parseDateLike(value = null) {
  if (value === null || value === undefined || value === "") return null;
  const candidate = value instanceof Date ? value.getTime() : value;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseStringFilter(value = null) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") continue;
      const parsed = item.trim();
      if (parsed.length > 0) return parsed;
    }
    return null;
  }
  if (typeof value !== "string") return null;
  const parsed = value.trim();
  return parsed.length > 0 ? parsed : null;
}

function parseIdFilter(value = null) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseIdList(value = null) {
  const values = Array.isArray(value)
    ? value
    : value === null || value === undefined
      ? []
      : String(value).split(",");

  const normalized = [];
  for (const item of values) {
    const parsed = parseIdFilter(item);
    if (parsed === null) continue;
    if (!normalized.includes(parsed)) normalized.push(parsed);
  }
  return normalized;
}

function usageTimeRange(query = {}) {
  const parsedDays = Number(query?.days ?? 30);
  const safeDays =
    Number.isFinite(parsedDays) && parsedDays > 0
      ? Math.min(365, Math.trunc(parsedDays))
      : 30;
  const to = parseDateLike(query?.to) || new Date();
  const from =
    parseDateLike(query?.from) ||
    new Date(to.getTime() - safeDays * 24 * 60 * 60 * 1000);
  if (from.getTime() > to.getTime()) {
    return { from: to, to: from };
  }
  return { from, to };
}

function usageBaseClause(query = {}) {
  const { from, to } = usageTimeRange(query);
  const clause = {
    occurredAt: {
      gte: from,
      lte: to,
    },
  };

  const userId = parseIdFilter(query?.userId);
  const workspaceId = parseIdFilter(query?.workspaceId);
  const teamId = parseIdFilter(query?.teamId);
  const eventType = parseStringFilter(query?.eventType);
  const provider = parseStringFilter(query?.provider);
  const model = parseStringFilter(query?.model);

  if (userId !== null) clause.userId = userId;
  if (workspaceId !== null) clause.workspaceId = workspaceId;
  if (teamId !== null) clause.teamId = teamId;
  if (eventType) clause.eventType = eventType;
  if (provider) clause.provider = provider;
  if (model) clause.model = model;
  return clause;
}

function timeSeriesBucket(date = new Date(), interval = "day") {
  const iso = new Date(date).toISOString();
  if (interval === "hour") return `${iso.slice(0, 13)}:00`;
  return iso.slice(0, 10);
}

module.exports = {
  parseDateLike,
  parseIdFilter,
  parseIdList,
  parseStringFilter,
  usageTimeRange,
  usageBaseClause,
  timeSeriesBucket,
};
