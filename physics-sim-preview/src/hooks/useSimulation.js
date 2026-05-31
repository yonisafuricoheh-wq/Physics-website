import { useEffect, useRef, useCallback } from 'react';
import { PhysicsEngine3D as PhysicsEngine } from '../engine/PhysicsEngine3D';
import useStore from '../store/simulationStore';

export function useSimulation() {
  const engineRef  = useRef(null);
  const rafRef     = useRef(null);
  const lastTsRef  = useRef(null);
  const stateRef   = useRef('idle');

  const blueprint        = useStore(s => s.blueprint);
  const simState         = useStore(s => s.simState);
  const timeScale        = useStore(s => s.timeScale);
  const forceOverrides   = useStore(s => s.forceOverrides);
  const setSimState      = useStore(s => s.setSimState);
  const tickObjectStates = useStore(s => s.tickObjectStates);
  const addSimTime       = useStore(s => s.addSimTime);

  useEffect(() => { stateRef.current = simState; }, [simState]);

  // Re-init engine whenever blueprint changes
  useEffect(() => {
    if (!blueprint) return;
    if (!engineRef.current) engineRef.current = new PhysicsEngine();
    engineRef.current.init(blueprint);
    lastTsRef.current = null;
  }, [blueprint]);

  // Core animation loop — one physics step per frame with scaled dt
  const loop = useCallback((ts) => {
    if (stateRef.current !== 'running') return;

    if (lastTsRef.current === null) lastTsRef.current = ts;
    const rawDt = Math.min((ts - lastTsRef.current) / 1000, 0.05); // cap at 50ms (tab focus spike)
    lastTsRef.current = ts;

    const physDt = rawDt * timeScale; // scale time — slow motion works automatically

    if (physDt > 0.0001 && engineRef.current) {
      // Apply teacher-mode force overrides
      engineRef.current.clearExtraForces();
      if (blueprint) {
        Object.entries(forceOverrides).forEach(([forceId, override]) => {
          const force = blueprint.forces.find(f => f.id === forceId);
          if (!force) return;
          const rad = (override.angle_degrees * Math.PI) / 180;
          engineRef.current.applyExtraForce(
            force.object_id,
            Math.cos(rad) * override.magnitude,
            Math.sin(rad) * override.magnitude,
          );
        });
      }

      engineRef.current.step(physDt);
      tickObjectStates(engineRef.current.getState());
      addSimTime(physDt);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [timeScale, forceOverrides, blueprint, tickObjectStates, addSimTime]);

  // Start / stop the RAF
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
    lastTsRef.current = null;
  }, []);

  const stepFrame = useCallback(() => {
    if (simState === 'running' || !engineRef.current || !blueprint) return;
    const dt = 1 / 60; // one visual frame worth of physics
    engineRef.current.step(dt * timeScale);
    tickObjectStates(engineRef.current.getState());
    addSimTime(dt * timeScale);
  }, [simState, blueprint, timeScale, tickObjectStates, addSimTime]);

  return { play, pause, reset, stepFrame, engine: engineRef.current };
}
