import { useEffect, useRef, useCallback } from 'react';
import { PhysicsEngine3D as PhysicsEngine } from '../engine/PhysicsEngine3D';
import useStore from '../store/simulationStore';

const FIXED_DT = 1 / 120;

export function useSimulation() {
  const engineRef  = useRef(null);
  const rafRef     = useRef(null);
  const accRef     = useRef(0);
  const lastTsRef  = useRef(null);
  const stateRef   = useRef('idle');

  const blueprint   = useStore(s => s.blueprint);
  const simState    = useStore(s => s.simState);
  const timeScale   = useStore(s => s.timeScale);
  const forceOverrides = useStore(s => s.forceOverrides);
  const setSimState    = useStore(s => s.setSimState);
  const tickObjectStates = useStore(s => s.tickObjectStates);
  const addSimTime       = useStore(s => s.addSimTime);

  // Keep ref in sync so animation loop always sees current value
  useEffect(() => { stateRef.current = simState; }, [simState]);

  // Re-init engine when blueprint changes
  useEffect(() => {
    if (!blueprint) return;
    if (!engineRef.current) engineRef.current = new PhysicsEngine();
    engineRef.current.init(blueprint);
    accRef.current = 0;
    lastTsRef.current = null;
  }, [blueprint]);

  // Core animation loop
  const loop = useCallback((ts) => {
    if (stateRef.current !== 'running') return;

    if (lastTsRef.current === null) lastTsRef.current = ts;
    const rawDt = Math.min((ts - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = ts;

    const scaledDt = rawDt * timeScale;
    accRef.current += scaledDt;

    let steps = 0;
    while (accRef.current >= FIXED_DT && steps < 12) {
      // Apply force overrides from teacher mode
      if (engineRef.current) {
        engineRef.current.clearExtraForces();
        Object.entries(forceOverrides).forEach(([forceId, override]) => {
          const bp = blueprint;
          if (!bp) return;
          const force = bp.forces.find(f => f.id === forceId);
          if (!force) return;
          const rad = (override.angle_degrees * Math.PI) / 180;
          const mag = override.magnitude;
          engineRef.current.applyExtraForce(force.object_id, Math.cos(rad) * mag, Math.sin(rad) * mag);
        });
      }
      engineRef.current?.step(FIXED_DT);
      accRef.current -= FIXED_DT;
      steps++;
    }

    if (steps > 0 && engineRef.current) {
      tickObjectStates(engineRef.current.getState());
      addSimTime(FIXED_DT * steps);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [timeScale, forceOverrides, blueprint, tickObjectStates, addSimTime]);

  // Start / stop the loop
  useEffect(() => {
    if (simState === 'running') {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [simState, loop]);

  const play = useCallback(() => {
    if (!engineRef.current || !blueprint) return;
    setSimState('running');
  }, [blueprint, setSimState]);

  const pause = useCallback(() => setSimState('paused'), [setSimState]);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    useStore.getState().resetSim();
    engineRef.current?.reset();
    accRef.current = 0;
    lastTsRef.current = null;
  }, []);

  const stepFrame = useCallback(() => {
    if (simState === 'running' || !engineRef.current || !blueprint) return;
    engineRef.current.step(FIXED_DT);
    tickObjectStates(engineRef.current.getState());
    addSimTime(FIXED_DT);
  }, [simState, blueprint, tickObjectStates, addSimTime]);

  return { play, pause, reset, stepFrame, engine: engineRef.current };
}
