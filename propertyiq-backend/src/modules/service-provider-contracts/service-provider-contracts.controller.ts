
import type { Request, Response } from "express";
import { ZodError } from "zod";

import { ServiceProviderContractsService } from "./service-provider-contracts.service";

import {
  contractIdSchema,
  serviceProviderIdSchema,
  createServiceProviderContractSchema,
  updateServiceProviderContractSchema,
  updateServiceProviderContractStatusSchema,
} from "./service-provider-contracts.validation";

const service = new ServiceProviderContractsService();

// =====================================================
// HELPERS
// =====================================================

function getUserId(req: Request): string | null {
  return req.user?.userId ?? null;
}

function getOrganizationId(req: Request): string | null {
  return (
    (req as any).organizationContext?.organizationId ??
    req.query.organizationId ??
    req.body?.organizationId ??
    null
  );
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed.",
      errors: error.issues,
    });
  }

  console.error("Service Provider Contracts Error:", error);

  return res.status(500).json({
    message: "An unexpected error occurred.",
  });
}

// =====================================================
// GET ALL CONTRACTS FOR A SERVICE PROVIDER
// =====================================================

export async function getServiceProviderContracts(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User and organization context are required.",
      });
    }

    const serviceProviderId = serviceProviderIdSchema.parse(
      req.params.serviceProviderId
    );

    const contracts = await service.getAll(
      serviceProviderId,
      organizationId,
      userId
    );

    return res.status(200).json(contracts);
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// GET CONTRACT BY ID
// =====================================================

export async function getServiceProviderContractById(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User and organization context are required.",
      });
    }

    const contractId = contractIdSchema.parse(req.params.id);

    const contract = await service.getById(
      contractId,
      organizationId,
      userId
    );

    if (!contract) {
      return res.status(404).json({
        message: "Contract not found.",
      });
    }

    return res.status(200).json(contract);
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// CREATE CONTRACT
// =====================================================

export async function createServiceProviderContract(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User and organization context are required.",
      });
    }

    const serviceProviderId = serviceProviderIdSchema.parse(
      req.params.serviceProviderId
    );

    const data = createServiceProviderContractSchema.parse({
      ...req.body,
      organizationId,
      serviceProviderId,
    });

    const contract = await service.create(data, userId);

    if (!contract) {
      return res.status(403).json({
        message:
          "Unable to create contract. Verify your permissions, provider, property, and property service.",
      });
    }

    return res.status(201).json({
      message: "Service provider contract created successfully.",
      contract,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// UPDATE CONTRACT
// =====================================================

export async function updateServiceProviderContract(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User and organization context are required.",
      });
    }

    const contractId = contractIdSchema.parse(req.params.id);

    const data = updateServiceProviderContractSchema.parse(req.body);

    const contract = await service.update(
      contractId,
      organizationId,
      userId,
      data
    );

    if (!contract) {
      return res.status(404).json({
        message: "Contract not found or cannot be updated.",
      });
    }

    return res.status(200).json({
      message: "Service provider contract updated successfully.",
      contract,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =====================================================
// UPDATE CONTRACT STATUS
// =====================================================

export async function updateServiceProviderContractStatus(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);

    if (!userId || !organizationId) {
      return res.status(400).json({
        message: "User and organization context are required.",
      });
    }

    const contractId = contractIdSchema.parse(req.params.id);

    const data = updateServiceProviderContractStatusSchema.parse(
      req.body
    );

    const contract = await service.updateStatus(
      contractId,
      organizationId,
      userId,
      data
    );

    if (!contract) {
      return res.status(404).json({
        message: "Contract not found or cannot be updated.",
      });
    }

    return res.status(200).json({
      message: "Service provider contract status updated successfully.",
      contract,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
