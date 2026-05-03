import { describe, it, expect, vi } from 'vitest';
import * as arrivalsService from '../src/services/arrivals.service';
import * as legacyApi from '../src/sources/legacyApi';

describe('arrivals.service', () => {
  describe('fetchSmartArrivals', () => {
    it('should deduplicate concurrent requests for the same stop (Thundering Herd)', async () => {
      // Mock legacy API to simulate a slow network call
      let callCount = 0;
      vi.spyOn(legacyApi, 'getArrivals').mockImplementation(async (stopId) => {
        callCount++;
        // artificial delay
        await new Promise(resolve => setTimeout(resolve, 50));
        return [];
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(arrivalsService.fetchSmartArrivals(100, undefined, true));
      }

      await Promise.all(promises);

      // The legacy API should have been called only ONCE, despite 10 concurrent calls
      // because the service should coalesce the identical inflight requests.
      expect(callCount).toBe(1);
    });
  });
});
