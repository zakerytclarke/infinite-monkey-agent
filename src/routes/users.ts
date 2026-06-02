import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db/connection.js";
import { logger } from "../logger.js";

const router = Router();

const getQueryValue = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

router.get("/users/:id", async (req: Request, res: Response) => {
  // get user by id logic
});

router.get("/users/search", async (req: Request, res: Response) => {
  const name = getQueryValue(req.query.name);
  const email = getQueryValue(req.query.email);
  const role = getQueryValue(req.query.role);

  let query = "SELECT id, name, email, role FROM users WHERE 1=1";
  const params: string[] = [];

  if (name) {
    params.push(`%${name}%`);
    query += ` AND name LIKE $${params.length}`;
  }
  if (email) {
    params.push(email);
    query += ` AND email = $${params.length}`;
  }
  if (role) {
    params.push(role);
    query += ` AND role = $${params.length}`;
  }

  logger.info({ query, params }, "Searching users");

  const result = await db.query(query, params);
  res.json(result.rows);
});
