
import type { Request, Response } from "express";
import { ZodError } from "zod";

import { ServiceProviderContactsService } from "./service-provider-contacts.service";

import {
  createServiceProviderContactSchema,
  updateServiceProviderContactSchema,
  updateServiceProviderContactStatusSchema,
  providerContactIdSchema,
  serviceProviderIdSchema,
  organizationIdSchema,
} from "./service-provider-contacts.validation";

const service = new ServiceProviderContactsService();

// =====================================================
// HELPERS
// =====================================================

function getUserId(req: Request): string | null {
  return req.user?.userId ?? null;
}

function getOrganizationId(req: Request): string | null {
  return (
    (req.query.organizationId as string | undefined) ??
    req.body?.organizationId ??
    null
  );
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed",
      errors: error.issues,
    });
  }

  console.error("Service provider contacts error:", error);

  return res.status(500).json({
    message: "Internal server error",
  });
}

// =====================================================
// GET ALL CONTACTS
// GET /service-providers/:serviceProviderId/contacts
// =====================================================

export async function getServiceProviderContacts(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User ID and organization ID are required",
      });
    }

    const validOrganizationId =
      organizationIdSchema.parse(organizationId);

    const validServiceProviderId =
      serviceProviderIdSchema.parse(req.params.serviceProviderId);

    const contacts = await service.getAll(
      validServiceProviderId,
      validOrganizationId,
      userId
    );

    return res.status(200).json(contacts);
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// GET CONTACT BY ID
// GET /service-providers/contacts/:id
// =====================================================

export async function getServiceProviderContactById(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User ID and organization ID are required",
      });
    }

    const validOrganizationId =
      organizationIdSchema.parse(organizationId);

    const providerContactId =
      providerContactIdSchema.parse(req.params.id);

    const contact = await service.getById(
      providerContactId,
      validOrganizationId,
      userId
    );

    if (!contact) {
      return res.status(404).json({
        message: "Service provider contact not found",
      });
    }

    return res.status(200).json(contact);
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// CREATE CONTACT
// POST /service-providers/:serviceProviderId/contacts
// =====================================================

export async function createServiceProviderContact(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const data = createServiceProviderContactSchema.parse({
      ...req.body,
      serviceProviderId: req.params.serviceProviderId,
    });

    const contact = await service.create(data, userId);

    if (!contact) {
      return res.status(403).json({
        message:
          "Unable to create contact. Verify your permissions and active service provider.",
      });
    }

    return res.status(201).json({
      message: "Service provider contact created successfully",
      contact,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// UPDATE CONTACT
// PUT /service-providers/contacts/:id
// =====================================================

export async function updateServiceProviderContact(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User ID and organization ID are required",
      });
    }

    const validOrganizationId =
      organizationIdSchema.parse(organizationId);

    const providerContactId =
      providerContactIdSchema.parse(req.params.id);

    const data = updateServiceProviderContactSchema.parse(req.body);

    const contact = await service.update(
      providerContactId,
      validOrganizationId,
      userId,
      data
    );

    if (!contact) {
      return res.status(404).json({
        message:
          "Service provider contact not found or update not permitted",
      });
    }

    return res.status(200).json({
      message: "Service provider contact updated successfully",
      contact,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// UPDATE CONTACT STATUS
// PATCH /service-providers/contacts/:id/status
// =====================================================

export async function updateServiceProviderContactStatus(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User ID and organization ID are required",
      });
    }

    const validOrganizationId =
      organizationIdSchema.parse(organizationId);

    const providerContactId =
      providerContactIdSchema.parse(req.params.id);

    const data = updateServiceProviderContactStatusSchema.parse(
      req.body
    );

    const contact = await service.updateStatus(
      providerContactId,
      validOrganizationId,
      userId,
      data
    );

    if (!contact) {
      return res.status(404).json({
        message:
          "Service provider contact not found or update not permitted",
      });
    }

    return res.status(200).json({
      message: "Service provider contact status updated successfully",
      contact,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
