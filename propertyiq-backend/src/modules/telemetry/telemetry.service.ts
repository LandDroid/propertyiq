import { TelemetryRepository } from "./telemetry.repository";

import type {
  CreateTelemetryInput,
} from "./telemetry.validation";

const repository =
  new TelemetryRepository();

export class TelemetryService {
  // =====================================================
  // CREATE READING
  // =====================================================

  async create(
    data: CreateTelemetryInput
  ) {
    const sensor =
      await repository.getSensor(
        data.sensorId,
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000"
      );

    if (!sensor) {
      throw new Error(
        "Sensor not found."
      );
    }

    const reading =
      await repository.create(data);

    await this.evaluateRules(
      sensor.SensorType,
      data
    );

    return reading;
  }

  // =====================================================
  // GET LATEST READING
  // =====================================================

  async getLatest(
    sensorId: string,
    organizationId: string,
    userId: string
  ) {
    const sensor =
      await repository.getSensor(
        sensorId,
        organizationId,
        userId
      );

    if (!sensor) {
      return null;
    }

    return repository.getLatest(
      sensorId
    );
  }

  // =====================================================
  // GET SENSOR HISTORY
  // =====================================================

  async getHistory(
    sensorId: string,
    organizationId: string,
    userId: string,
    limit = 100
  ) {
    const sensor =
      await repository.getSensor(
        sensorId,
        organizationId,
        userId
      );

    if (!sensor) {
      return null;
    }

    return repository.getHistory(
      sensorId,
      limit
    );
  }

  // =====================================================
  // PROPERTY DASHBOARD
  // =====================================================

  async getPropertyDashboard(
    propertyId: string,
    organizationId: string,
    userId: string
  ) {
    return repository.getPropertyReadings(
      propertyId,
      organizationId,
      userId
    );
  }

  // =====================================================
  // ALERT EVALUATION
  // =====================================================

  private async evaluateRules(
    sensorType: string,
    data: CreateTelemetryInput
  ) {
    switch (
      sensorType.toLowerCase()
    ) {
      case "temperature":
        await this.evaluateTemperature(
          data.numericValue
        );
        break;

      case "water":
      case "leak":
        await this.evaluateLeak(
          data.numericValue,
          data.textValue
        );
        break;

      case "humidity":
        await this.evaluateHumidity(
          data.numericValue
        );
        break;

      case "battery":
        await this.evaluateBattery(
          data.numericValue
        );
        break;

      default:
        break;
    }
  }

  // =====================================================
  // FREEZE DETECTION
  // =====================================================

  private async evaluateTemperature(
    value?: number
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      return;
    }

    if (value < 5) {
      console.warn(
        `FREEZE WARNING: ${value}°`
      );

      /*
      Future:

      await alertsRepository.create({
        severity: "Critical",
        title: "Freeze Risk Detected"
      });
      */
    }
  }

  // =====================================================
  // WATER LEAK DETECTION
  // =====================================================

  private async evaluateLeak(
    numericValue?: number,
    textValue?: string
  ) {
    const leakDetected =
      numericValue === 1 ||
      textValue?.toLowerCase() ===
        "true" ||
      textValue?.toLowerCase() ===
        "leak";

    if (!leakDetected) {
      return;
    }

    console.warn(
      "CRITICAL: Water leak detected"
    );

    /*
    Future:

    await alertsRepository.create({
      severity: "Critical",
      title: "Water Leak Detected"
    });
    */
  }

  // =====================================================
  // HIGH HUMIDITY
  // =====================================================

  private async evaluateHumidity(
    value?: number
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      return;
    }

    if (value > 80) {
      console.warn(
        `HIGH HUMIDITY: ${value}%`
      );

      /*
      Future:

      await alertsRepository.create({
        severity: "Warning"
      });
      */
    }
  }

  // =====================================================
  // LOW BATTERY
  // =====================================================

  private async evaluateBattery(
    value?: number
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      return;
    }

    if (value < 20) {
      console.warn(
        `LOW BATTERY: ${value}%`
      );

      /*
      Future:

      await alertsRepository.create({
        severity: "Warning"
      });
      */
    }
  }
}