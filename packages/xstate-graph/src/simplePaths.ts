import { EventObject, AnyStateMachine, StateFrom, EventFrom } from 'xstate';
import {
  SerializedEvent,
  SerializedState,
  SimpleBehavior,
  StatePath,
  TraversalOptions,
  VisitedContext
} from './types';
import { resolveTraversalOptions, createDefaultMachineOptions } from './graph';
import { getAdjacencyMap } from './adjacency';
import { flatten } from 'xstate/src/utils';

export function getMachineSimplePaths<TMachine extends AnyStateMachine>(
  machine: TMachine,
  options?: TraversalOptions<StateFrom<TMachine>, EventFrom<TMachine>>
): Array<StatePath<StateFrom<TMachine>, EventFrom<TMachine>>> {
  const resolvedOptions = resolveTraversalOptions(
    options,
    createDefaultMachineOptions(machine)
  );

  return getSimplePaths(machine as SimpleBehavior<any, any>, resolvedOptions);
}

export function getSimplePaths<TState, TEvent extends EventObject>(
  behavior: SimpleBehavior<TState, TEvent>,
  options: TraversalOptions<TState, TEvent>
): Array<StatePath<TState, TEvent>> {
  const resolvedOptions = resolveTraversalOptions(options);
  const fromState = resolvedOptions.fromState ?? behavior.initialState;
  const serializeState = resolvedOptions.serializeState as (
    ...args: Parameters<typeof resolvedOptions.serializeState>
  ) => SerializedState;
  const adjacency = getAdjacencyMap(behavior, resolvedOptions);
  const stateMap = new Map<SerializedState, TState>();
  const visitCtx: VisitedContext<TState, TEvent> = {
    vertices: new Set(),
    edges: new Set()
  };
  const path: any[] = [];
  const pathMap: Record<
    SerializedState,
    { state: TState; paths: Array<StatePath<TState, TEvent>> }
  > = {};

  function util(
    fromStateSerial: SerializedState,
    toStateSerial: SerializedState
  ) {
    const fromState = stateMap.get(fromStateSerial)!;
    visitCtx.vertices.add(fromStateSerial);

    if (fromStateSerial === toStateSerial) {
      if (!pathMap[toStateSerial]) {
        pathMap[toStateSerial] = {
          state: stateMap.get(toStateSerial)!,
          paths: []
        };
      }

      const toStatePlan = pathMap[toStateSerial];

      const path2: StatePath<TState, TEvent> = {
        state: fromState,
        weight: path.length,
        steps: [...path]
      };

      toStatePlan.paths.push(path2);
    } else {
      for (const serializedEvent of Object.keys(
        adjacency[fromStateSerial].transitions
      ) as SerializedEvent[]) {
        const { state: nextState, event: subEvent } = adjacency[
          fromStateSerial
        ].transitions[serializedEvent];

        if (!(serializedEvent in adjacency[fromStateSerial].transitions)) {
          continue;
        }
        const prevState = stateMap.get(fromStateSerial);

        const nextStateSerial = serializeState(nextState, subEvent, prevState);
        stateMap.set(nextStateSerial, nextState);

        if (!visitCtx.vertices.has(nextStateSerial)) {
          visitCtx.edges.add(serializedEvent);
          path.push({
            state: stateMap.get(fromStateSerial)!,
            event: subEvent
          });
          util(nextStateSerial, toStateSerial);
        }
      }
    }

    path.pop();
    visitCtx.vertices.delete(fromStateSerial);
  }

  const fromStateSerial = serializeState(fromState, undefined);
  stateMap.set(fromStateSerial, fromState);

  for (const nextStateSerial of Object.keys(adjacency) as SerializedState[]) {
    util(fromStateSerial, nextStateSerial);
  }

  return flatten(Object.values(pathMap).map((p) => p.paths));
}

export function getSimplePathsTo<TState, TEvent extends EventObject>(
  behavior: SimpleBehavior<TState, TEvent>,
  predicate: (state: TState) => boolean,
  options: TraversalOptions<TState, TEvent>
): Array<StatePath<TState, TEvent>> {
  const resolvedOptions = resolveTraversalOptions(options);
  const simplePaths = getSimplePaths(behavior, resolvedOptions);

  return simplePaths.filter((path) => predicate(path.state));
}

export function getSimplePathsFromTo<TState, TEvent extends EventObject>(
  behavior: SimpleBehavior<TState, TEvent>,
  fromPredicate: (state: TState) => boolean,
  toPredicate: (state: TState) => boolean,
  options: TraversalOptions<TState, TEvent>
): Array<StatePath<TState, TEvent>> {
  const resolvedOptions = resolveTraversalOptions(options);
  const simplePaths = getSimplePaths(behavior, resolvedOptions);

  return simplePaths.filter((path) => {
    return (
      toPredicate(path.state) &&
      path.steps.some((step) => fromPredicate(step.state))
    );
  });
}
