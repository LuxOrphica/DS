function createAuditModule({ db }) {
  function writeAuditLog(action, entityType, entityId, details = {}, actor = "system") {
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_log (created_at, actor, action, entity_type, entity_id, details_json)
      VALUES (@createdAt, @actor, @action, @entityType, @entityId, @detailsJson)
    `).run({
      createdAt,
      actor: String(actor || "system"),
      action: String(action || "").trim(),
      entityType: String(entityType || "").trim(),
      entityId: String(entityId || "").trim(),
      detailsJson: JSON.stringify(details || {})
    });
  }

  function listAdminAuditLog({ limit = 200, offset = 0, entityType = "", action = "" } = {}) {
    const where = [];
    const params = {
      limit: Math.max(1, Math.min(500, Number(limit || 200))),
      offset: Math.max(0, Number(offset || 0))
    };
    if (String(entityType || "").trim()) {
      where.push("entity_type = @entityType");
      params.entityType = String(entityType).trim();
    }
    if (String(action || "").trim()) {
      where.push("action = @action");
      params.action = String(action).trim();
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = db
      .prepare(`
        SELECT
          id,
          created_at AS createdAt,
          actor,
          action,
          entity_type AS entityType,
          entity_id AS entityId,
          details_json AS detailsJson
        FROM audit_log
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT @limit OFFSET @offset
      `)
      .all(params)
      .map((row) => {
        let details = {};
        try {
          details = JSON.parse(row.detailsJson || "{}");
        } catch {
          details = {};
        }
        return {
          id: row.id,
          createdAt: row.createdAt,
          actor: row.actor,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          details
        };
      });

    const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`).get(params).c;
    return { rows, total };
  }

  return {
    writeAuditLog,
    listAdminAuditLog
  };
}

module.exports = { createAuditModule };
