
import { SettingsRepository } from "./settings.repository";

const repository = new SettingsRepository();

export class SettingsService {
  // =====================================================
  // GET ACCOUNT SETTINGS
  // =====================================================

  async getSettings(userId: string) {
    return repository.getSettings(userId);
  }

  // =====================================================
  // UPDATE ORGANIZATION NAME
  // =====================================================

  async updateOrganizationName(
    userId: string,
    organizationId: string,
    organizationName: string
  ) {
    const normalizedName = organizationName.trim();

    if (!normalizedName) {
      throw new Error("Organization name is required.");
    }

    if (normalizedName.length > 150) {
      throw new Error(
        "Organization name cannot exceed 150 characters."
      );
    }

    return repository.updateOrganizationName(
      userId,
      organizationId,
      normalizedName
    );
  }
}
