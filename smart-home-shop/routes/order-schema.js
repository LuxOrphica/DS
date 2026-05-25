const { z } = require("zod");

const trimmedString = (maxLength) => z.string().trim().max(maxLength);

const orderCustomerSchema = z.object({
  name: trimmedString(200).min(1, "Name is required."),
  phone: trimmedString(50).min(1, "Phone is required."),
  address: trimmedString(500).min(1, "Address is required."),
  email: trimmedString(254).optional().default("")
}).passthrough();

const orderItemSchema = z.object({
  id: trimmedString(200).optional().default(""),
  productId: trimmedString(200).optional(),
  name: trimmedString(500).optional().default(""),
  article: trimmedString(200).optional().default(""),
  image: trimmedString(2000).optional().default(""),
  qty: z.coerce.number().int().min(1).max(9999),
  price: z.coerce.number().finite().nonnegative().optional().default(0)
}).passthrough();

const createOrderSchema = z.object({
  customer: orderCustomerSchema,
  items: z.array(orderItemSchema).min(1, "Cart is empty.").max(200, "Too many items in cart."),
  total: z.coerce.number().finite().nonnegative().max(1_000_000_000).optional().default(0),
  paymentMethod: trimmedString(80).optional().default("card_on_delivery"),
  deliveryComment: trimmedString(1000).optional().default("")
}).strict();

function formatZodError(error) {
  const first = error.issues && error.issues[0];
  if (!first) return "Invalid request body.";
  const field = first.path && first.path.length ? first.path.join(".") : "body";
  return `${field}: ${first.message}`;
}

module.exports = {
  createOrderSchema,
  formatZodError
};
