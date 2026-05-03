import { getLinesForStop, getLine, getLinePositionMap, getCommonStops, getStopName } from '../sources/lineIndex';

export interface TripOption {
  type: 'direct' | 'transfer';
  line: string;
  name: string;
  color: string;
  direction: string;
  stops: number;
  total_stops: number;
  duration_min: number;
  transfer_at?: { stopId: number; name: string };
  transfer_line?: string;
  transfer_direction?: string;
  transfer_stops?: number;
}

/**
 * Find all direct (single-line) routes between two stops.
 * Handles same-direction forward trips, circular line wrap-around,
 * and same-line different-direction trips (ride to terminus, line continues).
 */
export function findDirectRoutes(fromId: number, toId: number): TripOption[] {
  const options: TripOption[] = [];
  const fromLines = getLinesForStop(fromId);
  const toLines = getLinesForStop(toId);

  for (const lineId of fromLines) {
    if (!toLines.includes(lineId)) continue;
    const lineInfo = getLine(lineId);
    if (!lineInfo) continue;

    const dirs = Object.keys(lineInfo.directions);

    // ── Same-direction trips ──────────────────────────────────────
    for (const dir of dirs) {
      const positions = getLinePositionMap(lineId, dir);
      if (!positions) continue;
      const fromPos = positions.get(fromId);
      const toPos = positions.get(toId);
      if (fromPos === undefined || toPos === undefined) continue;

      if (toPos > fromPos) {
        // Forward trip within same direction
        const nStops = toPos - fromPos;
        options.push({
          type: 'direct',
          line: lineId,
          name: lineInfo.name,
          color: lineInfo.color,
          direction: lineInfo.directions[dir].destination,
          stops: nStops,
          total_stops: nStops,
          duration_min: Math.max(1, nStops * 2),
        });
      } else {
        // Check for circular line: first stop equals last stop
        const dirStops = lineInfo.directions[dir].stops;
        if (dirStops.length > 1 && dirStops[0] === dirStops[dirStops.length - 1]) {
          // Wrap-around distance: from → end → start → to
          const wrapStops = (dirStops.length - 1 - fromPos) + toPos;
          if (wrapStops > 0) {
            options.push({
              type: 'direct',
              line: lineId,
              name: lineInfo.name,
              color: lineInfo.color,
              direction: lineInfo.directions[dir].destination,
              stops: wrapStops,
              total_stops: wrapStops,
              duration_min: Math.max(1, wrapStops * 2),
            });
          }
        }
      }
    }

    // ── Same-line different-direction trips ───────────────────────
    if (dirs.length === 2) {
      const [dirA, dirB] = dirs;

      // Case: fromId in dirA, toId in dirB only
      {
        const posA = getLinePositionMap(lineId, dirA);
        const posB = getLinePositionMap(lineId, dirB);
        if (posA && posB) {
          const fromPosA = posA.get(fromId);
          const toPosB = posB.get(toId);
          const toPosA = posA.get(toId);
          if (fromPosA !== undefined && toPosB !== undefined && toPosA === undefined) {
            const leg1Stops = (lineInfo.directions[dirA].stops.length - 1) - fromPosA;
            const totalStops = leg1Stops + toPosB;
            options.push({
              type: 'direct',
              line: lineId,
              name: lineInfo.name,
              color: lineInfo.color,
              direction: lineInfo.directions[dirA].destination,
              stops: leg1Stops,
              total_stops: totalStops,
              duration_min: Math.max(1, totalStops * 2),
            });
          }
        }
      }

      // Case: fromId in dirB, toId in dirA only
      {
        const posB = getLinePositionMap(lineId, dirB);
        const posA = getLinePositionMap(lineId, dirA);
        if (posB && posA) {
          const fromPosB = posB.get(fromId);
          const toPosA = posA.get(toId);
          const toPosB = posB.get(toId);
          if (fromPosB !== undefined && toPosA !== undefined && toPosB === undefined) {
            const leg1Stops = (lineInfo.directions[dirB].stops.length - 1) - fromPosB;
            const totalStops = leg1Stops + toPosA;
            options.push({
              type: 'direct',
              line: lineId,
              name: lineInfo.name,
              color: lineInfo.color,
              direction: lineInfo.directions[dirB].destination,
              stops: leg1Stops,
              total_stops: totalStops,
              duration_min: Math.max(1, totalStops * 2),
            });
          }
        }
      }
    }
  }

  return options;
}

/**
 * Find all transfer (two-line) routes between two stops.
 */
export function findTransferRoutes(fromId: number, toId: number): TripOption[] {
  const options: TripOption[] = [];
  const fromLines = getLinesForStop(fromId);
  const toLines = getLinesForStop(toId);

  for (const lineA of fromLines) {
    const lineAInfo = getLine(lineA);
    if (!lineAInfo) continue;

    for (const lineB of toLines) {
      if (lineA === lineB) continue;
      const lineBInfo = getLine(lineB);
      if (!lineBInfo) continue;

      const commonStops = getCommonStops(lineA, lineB);

      for (const commonStopId of commonStops) {
        const dirsA = Object.keys(lineAInfo.directions);
        const dirsB = Object.keys(lineBInfo.directions);

        for (const dirA of dirsA) {
          const posA = getLinePositionMap(lineA, dirA);
          if (!posA) continue;
          const fromPos = posA.get(fromId);
          const commonPosA = posA.get(commonStopId);
          if (fromPos === undefined || commonPosA === undefined || commonPosA <= fromPos) continue;

          for (const dirB of dirsB) {
            const posB = getLinePositionMap(lineB, dirB);
            if (!posB) continue;
            const commonPosB = posB.get(commonStopId);
            const toPos = posB.get(toId);
            if (commonPosB === undefined || toPos === undefined || toPos <= commonPosB) continue;

            const leg1Stops = commonPosA - fromPos;
            const leg2Stops = toPos - commonPosB;
            const totalStops = leg1Stops + leg2Stops;
            const duration = totalStops * 2 + 5;

            const transferName = getStopName(commonStopId) || 'Unknown';

            options.push({
              type: 'transfer',
              line: lineA,
              name: lineAInfo.name,
              color: lineAInfo.color,
              direction: lineAInfo.directions[dirA].destination,
              stops: leg1Stops,
              total_stops: totalStops,
              duration_min: Math.max(1, duration),
              transfer_at: { stopId: commonStopId, name: transferName },
              transfer_line: lineB,
              transfer_direction: lineBInfo.directions[dirB].destination,
              transfer_stops: leg2Stops,
            });
          }
        }
      }
    }
  }

  return options;
}
