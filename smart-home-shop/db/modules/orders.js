function createOrdersModule({ db, writeAuditLog, normalizeOrderDocumentsInput }) {
  function toPublicOrderRow(order) {
    return {
      id: order.id,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      customerAddress: order.customerAddress,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      deliveryMethod: order.deliveryMethod,
      total: order.total,
      status: order.status,
      items: Array.isArray(order.items) ? order.items : [],
      statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : [],
      orderDocuments: Array.isArray(order.orderDocuments) ? order.orderDocuments : []
    };
  }

  function listAdminOrders({
    limit = 200,
    offset = 0,
    search = "",
    status = "",
    paymentStatus = "",
    paymentMethod = "",
    manager = "",
    deliveryMethod = "",
    dateFrom = "",
    dateTo = ""
  } = {}) {
    const normalizeIsoDateStart = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
      return raw;
    };
    const normalizeIsoDateEnd = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59:59.999Z`;
      return raw;
    };
    const where = [];
    const params = {
      limit: Math.max(1, Math.min(500, Number(limit || 200))),
      offset: Math.max(0, Number(offset || 0))
    };
    if (String(search || "").trim()) {
      where.push(`
        (
          o.id LIKE @search
          OR o.customer_name LIKE @search
          OR o.customer_phone LIKE @search
          OR o.customer_email LIKE @search
        )
      `);
      params.search = `%${String(search).trim()}%`;
    }
    if (String(status || "").trim()) {
      where.push("o.status = @status");
      params.status = String(status).trim();
    }
    if (String(paymentStatus || "").trim()) {
      where.push("o.payment_status = @paymentStatus");
      params.paymentStatus = String(paymentStatus).trim();
    }
    if (String(paymentMethod || "").trim()) {
      where.push("o.payment_method = @paymentMethod");
      params.paymentMethod = String(paymentMethod).trim();
    }
    if (String(manager || "").trim()) {
      where.push("o.manager LIKE @manager");
      params.manager = `%${String(manager).trim()}%`;
    }
    if (String(deliveryMethod || "").trim()) {
      where.push("o.delivery_method = @deliveryMethod");
      params.deliveryMethod = String(deliveryMethod).trim();
    }
    if (String(dateFrom || "").trim()) {
      where.push("o.created_at >= @dateFrom");
      params.dateFrom = normalizeIsoDateStart(dateFrom);
    }
    if (String(dateTo || "").trim()) {
      where.push("o.created_at <= @dateTo");
      params.dateTo = normalizeIsoDateEnd(dateTo);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = db
      .prepare(`
        SELECT
          o.id,
          o.created_at AS createdAt,
          o.updated_at AS updatedAt,
          o.customer_name AS customerName,
          o.customer_phone AS customerPhone,
          o.customer_email AS customerEmail,
          o.customer_address AS customerAddress,
          o.payment_method AS paymentMethod,
          o.payment_status AS paymentStatus,
          o.delivery_method AS deliveryMethod,
          o.manager,
          o.total,
          o.status,
          COUNT(oi.id) AS itemCount
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        ${whereSql}
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT @limit OFFSET @offset
      `)
      .all(params);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o ${whereSql}`).get(params).c;
    return { rows, total };
  }

  function getAdminOrderById(orderId) {
    const id = String(orderId || "").trim();
    if (!id) return null;
    const order = db
      .prepare(`
        SELECT
          id,
          created_at AS createdAt,
          updated_at AS updatedAt,
          customer_name AS customerName,
          customer_phone AS customerPhone,
          customer_email AS customerEmail,
          customer_address AS customerAddress,
          payment_method AS paymentMethod,
          payment_status AS paymentStatus,
          delivery_method AS deliveryMethod,
          delivery_comment AS deliveryComment,
          manager,
          manager_comment AS managerComment,
          total,
          status,
          status_history_json AS statusHistoryJson,
          order_documents_json AS orderDocumentsJson
        FROM orders
        WHERE id = @id
        LIMIT 1
      `)
      .get({ id });
    if (!order) return null;

    const items = db
      .prepare(`
        SELECT
          id,
          product_id AS productId,
          name,
          article,
          price,
          price AS priceValue,
          'RUB' AS priceCurrency,
          price AS priceRub,
          qty,
          image
        FROM order_items
        WHERE order_id = @id
        ORDER BY id ASC
      `)
      .all({ id });

    let statusHistory = [];
    try {
      const parsed = JSON.parse(order.statusHistoryJson || "[]");
      statusHistory = Array.isArray(parsed) ? parsed : [];
    } catch {
      statusHistory = [];
    }
    let orderDocuments = [];
    try {
      const parsed = JSON.parse(order.orderDocumentsJson || "[]");
      orderDocuments = normalizeOrderDocumentsInput(parsed);
    } catch {
      orderDocuments = [];
    }
    return {
      ...order,
      items,
      statusHistory,
      orderDocuments
    };
  }

  function updateAdminOrder(orderId, patch = {}) {
    const id = String(orderId || "").trim();
    if (!id) return 0;
    const current = getAdminOrderById(id);
    if (!current) return 0;

    const map = {
      status: "status",
      paymentStatus: "payment_status",
      paymentMethod: "payment_method",
      deliveryMethod: "delivery_method",
      manager: "manager",
      managerComment: "manager_comment",
      deliveryComment: "delivery_comment",
      orderDocuments: "order_documents_json"
    };
    const setParts = [];
    const params = { id, updatedAt: new Date().toISOString() };
    for (const [key, col] of Object.entries(map)) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      setParts.push(`${col} = @${key}`);
      if (key === "orderDocuments") {
        params[key] = JSON.stringify(normalizeOrderDocumentsInput(patch[key]));
      } else {
        params[key] = String(patch[key] ?? "").trim();
      }
    }
    if (!setParts.length) return 0;

    const history = Array.isArray(current.statusHistory) ? [...current.statusHistory] : [];
    const nextStatus = Object.prototype.hasOwnProperty.call(patch, "status")
      ? String(patch.status || "").trim()
      : current.status;
    const nextPaymentStatus = Object.prototype.hasOwnProperty.call(patch, "paymentStatus")
      ? String(patch.paymentStatus || "").trim()
      : current.paymentStatus;
    if (nextStatus !== current.status || nextPaymentStatus !== current.paymentStatus) {
      history.push({
        at: params.updatedAt,
        by: "admin",
        status: nextStatus,
        paymentStatus: nextPaymentStatus
      });
      setParts.push("status_history_json = @statusHistoryJson");
      params.statusHistoryJson = JSON.stringify(history);
    }

    setParts.push("updated_at = @updatedAt");
    const changes = db.prepare(`UPDATE orders SET ${setParts.join(", ")} WHERE id = @id`).run(params).changes;
    if (changes > 0) {
      writeAuditLog("update", "order", id, { patch });
    }
    return changes;
  }

  function listPublicOrdersByLookup({ query = "", limit = 20 } = {}) {
    const raw = String(query || "").trim();
    if (raw.length < 4) return { rows: [], total: 0 };

    const safeLimit = Math.max(1, Math.min(50, Number(limit || 20)));
    const like = `%${raw}%`;
    const params = {
      exactId: raw,
      idLike: like,
      like,
      limit: safeLimit
    };

    const phoneDigits = raw.replace(/\D/g, "");
    const phoneCandidates = [];
    if (phoneDigits.length >= 4) {
      const uniq = new Set([phoneDigits]);
      if (phoneDigits.length === 11 && phoneDigits.startsWith("8")) {
        uniq.add(`7${phoneDigits.slice(1)}`);
      } else if (phoneDigits.length === 11 && phoneDigits.startsWith("7")) {
        uniq.add(`8${phoneDigits.slice(1)}`);
      }
      for (const candidate of uniq) {
        if (candidate.length >= 4) phoneCandidates.push(candidate);
      }
    }

    const normalizedPhoneSql = `
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        o.customer_phone,
        ' ', ''), '+', ''), '-', ''), '(', ''), ')', ''), '.', ''), ',', '')
    `;

    const phoneWhere = [];
    for (let i = 0; i < phoneCandidates.length; i += 1) {
      const key = `phoneLike${i}`;
      params[key] = `%${phoneCandidates[i]}%`;
      phoneWhere.push(`${normalizedPhoneSql} LIKE @${key}`);
    }

    const whereParts = [
      "o.id = @exactId",
      "o.id LIKE @idLike",
      "o.customer_phone LIKE @like",
      "o.customer_email LIKE @like",
      ...phoneWhere
    ];

    const ids = db
      .prepare(`
        SELECT o.id
        FROM orders o
        WHERE ${whereParts.join(" OR ")}
        ORDER BY o.created_at DESC
        LIMIT @limit
      `)
      .all(params)
      .map((row) => String(row.id || "").trim())
      .filter(Boolean);

    const rows = ids
      .map((id) => getAdminOrderById(id))
      .filter(Boolean)
      .map((order) => toPublicOrderRow(order));

    return { rows, total: rows.length };
  }

  function listPublicOrdersByIds({ ids = [], limit = 20 } = {}) {
    const source = Array.isArray(ids) ? ids : [];
    const safeLimit = Math.max(1, Math.min(50, Number(limit || 20)));
    const normalized = [];
    const seen = new Set();
    for (const rawId of source) {
      const id = String(rawId || "").trim();
      if (!/^ORD-\d{8,}$/.test(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
      if (normalized.length >= safeLimit) break;
    }
    if (!normalized.length) return { rows: [], total: 0 };

    const placeholders = normalized.map((_, i) => `@id${i}`).join(", ");
    const params = Object.fromEntries(normalized.map((id, i) => [`id${i}`, id]));
    const rows = db
      .prepare(`
        SELECT o.id
        FROM orders o
        WHERE o.id IN (${placeholders})
        ORDER BY o.created_at DESC
      `)
      .all(params)
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
      .map((id) => getAdminOrderById(id))
      .filter(Boolean)
      .map((order) => toPublicOrderRow(order));
    return { rows, total: rows.length };
  }

  function createOrder(payload) {
    const orderId = `ORD-${Date.now()}`;
    const now = new Date().toISOString();

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, created_at, customer_name, customer_phone, customer_address, payment_method,
        customer_email, payment_status, delivery_method, manager, manager_comment,
        delivery_comment, total, status, updated_at, status_history_json, order_documents_json
      ) VALUES (
        @id, @createdAt, @customerName, @customerPhone, @customerAddress, @paymentMethod,
        @customerEmail, @paymentStatus, @deliveryMethod, @manager, @managerComment,
        @deliveryComment, @total, @status, @updatedAt, @statusHistoryJson, @orderDocumentsJson
      )
    `);

    const insertItem = db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, name, article, price, qty, image
      ) VALUES (
        @orderId, @productId, @name, @article, @price, @qty, @image
      )
    `);

    const tx = db.transaction(() => {
      insertOrder.run({
        id: orderId,
        createdAt: now,
        customerName: payload.customer.name,
        customerPhone: payload.customer.phone,
        customerAddress: payload.customer.address,
        customerEmail: String(payload?.customer?.email || "").trim(),
        paymentMethod: payload.paymentMethod || "card_on_delivery",
        paymentStatus: String(payload.paymentStatus || "unpaid").trim() || "unpaid",
        deliveryMethod: String(payload.deliveryMethod || "").trim(),
        manager: "",
        managerComment: "",
        deliveryComment: payload.deliveryComment || "",
        total: Number(payload.total || 0),
        status: "new",
        updatedAt: now,
        statusHistoryJson: JSON.stringify([{ at: now, by: "system", status: "new", paymentStatus: "unpaid" }]),
        orderDocumentsJson: "[]"
      });

      for (const item of payload.items) {
        insertItem.run({
          orderId,
          productId: item.id || "",
          name: item.name || "",
          article: item.article || "",
          price: Number(item.price || 0),
          qty: Number(item.qty || 1),
          image: item.image || ""
        });
      }
    });

    tx();
    writeAuditLog("create", "order", orderId, {
      total: Number(payload.total || 0),
      items: Array.isArray(payload.items) ? payload.items.length : 0,
      customerPhone: String(payload?.customer?.phone || "")
    });
    return {
      orderId,
      createdAt: now,
      status: "new",
      paymentStatus: String(payload.paymentStatus || "unpaid").trim() || "unpaid",
      paymentMethod: payload.paymentMethod || "card_on_delivery",
      deliveryMethod: String(payload.deliveryMethod || "").trim()
    };
  }

  return {
    createOrder,
    getAdminOrderById,
    listAdminOrders,
    listPublicOrdersByIds,
    listPublicOrdersByLookup,
    updateAdminOrder
  };
}

module.exports = { createOrdersModule };
