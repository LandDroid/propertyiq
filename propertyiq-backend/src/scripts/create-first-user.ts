
import argon2 from "argon2";
import { getDatabase, sql } from "../config/database";

async function main() {
  const email = process.env.FIRST_USER_EMAIL?.trim().toLowerCase();
  const firstName = process.env.FIRST_USER_FIRST_NAME?.trim();
  const lastName = process.env.FIRST_USER_LAST_NAME?.trim() || null;
  const password = process.env.FIRST_USER_PASSWORD;

  const organizationId = "290FE9A8-C8A3-40D7-9592-97E1BEDB04C4";

  if (!email || !firstName || !password) {
    throw new Error(
      "Set FIRST_USER_EMAIL, FIRST_USER_FIRST_NAME and FIRST_USER_PASSWORD first."
    );
  }

  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }

  if (!/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)) {
    throw new Error(
      "Password must contain uppercase, lowercase and numeric characters."
    );
  }

  const pool = await getDatabase();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const organization = await new sql.Request(transaction)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .query(`
        SELECT OrganizationId
        FROM dbo.Organizations
        WHERE OrganizationId = @organizationId
          AND Status = 'active';
      `);

    if (organization.recordset.length === 0) {
      throw new Error("The PropertyIQ Demo organization was not found or is inactive.");
    }

    const existingUser = await new sql.Request(transaction)
      .input("email", sql.NVarChar(255), email)
      .query(`
        SELECT UserId
        FROM dbo.Users
        WHERE Email = @email;
      `);

    if (existingUser.recordset.length > 0) {
      throw new Error(
        "A user with this email already exists. Use another email or sign in with that account."
      );
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    const userResult = await new sql.Request(transaction)
      .input("email", sql.NVarChar(255), email)
      .input("firstName", sql.NVarChar(100), firstName)
      .input("lastName", sql.NVarChar(100), lastName)
      .input("passwordHash", sql.NVarChar(500), passwordHash)
      .query(`
        INSERT INTO dbo.Users (
          Email,
          FirstName,
          LastName,
          PasswordHash,
          Status
        )
        OUTPUT INSERTED.UserId
        VALUES (
          @email,
          @firstName,
          @lastName,
          @passwordHash,
          'active'
        );
      `);

    const userId = userResult.recordset[0].UserId;

    await new sql.Request(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("organizationId", sql.UniqueIdentifier, organizationId)
      .query(`
        INSERT INTO dbo.Memberships (
          UserId,
          OrganizationId,
          Role
        )
        VALUES (
          @userId,
          @organizationId,
          'Owner'
        );
      `);

    await transaction.commit();

    console.log("");
    console.log("==================================");
    console.log("PROPERTYIQ USER CREATED");
    console.log("==================================");
    console.log("Email:", email);
    console.log("User ID:", userId);
    console.log("Organization:", "PropertyIQ Demo");
    console.log("Role:", "Owner");
    console.log("==================================");
    console.log("You can now sign in at /login.");
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Transaction may already have been rolled back.
    }

    throw error;
  } finally {
    delete process.env.FIRST_USER_PASSWORD;
  }
}

main()
  .catch((error) => {
    console.error("Could not create the first user:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
