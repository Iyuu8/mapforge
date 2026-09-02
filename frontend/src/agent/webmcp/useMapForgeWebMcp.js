import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmModal from '../../components/common/ConfirmModal';
import { createMapForgeAgentService } from '../../application/mapForgeAgentService';
import { registerMapForgeWebMcpTools } from './toolRegistry';

function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useMapForgeWebMcp(context) {
  const latestContext = useLatest(context);
  const [confirmation, setConfirmation] = useState(null);
  const [activity, setActivity] = useState(null);
  const activityTimerRef = useRef(null);
  const activeOperationIdsRef = useRef(new Set());

  const service = useMemo(
    () => createMapForgeAgentService(() => latestContext.current),
    [latestContext]
  );

  const confirm = useMemo(
    () => (request) =>
      new Promise((resolve, reject) => {
        setConfirmation({
          title: request.title,
          message: request.message,
          confirmLabel: request.confirmLabel || 'Confirm',
          resolve,
          reject,
        });
      }),
    []
  );

  useEffect(() => {
    let registration = null;
    let cancelled = false;
    const lifecycleController = new AbortController();

    registerMapForgeWebMcpTools({
      service,
      canEdit: Boolean(context.canEdit),
      confirm,
      lifecycleSignal: lifecycleController.signal,
    }).then((result) => {
      if (cancelled) {
        result.unregister();
        return;
      }
      registration = result;
      if (result.supported) {
        window.dispatchEvent(new CustomEvent('mapforge:webmcp:registered', {
          detail: { toolNames: result.toolNames },
        }));
      }
    }).catch((error) => {
      if (cancelled || lifecycleController.signal.aborted) return;
      window.dispatchEvent(new CustomEvent('mapforge:webmcp:registration-failed', {
        detail: { message: error?.message || 'WebMCP registration failed.' },
      }));
    });

    return () => {
      cancelled = true;
      lifecycleController.abort();
      registration?.unregister();
    };
  }, [confirm, context.canEdit, service]);

  useEffect(() => {
    const activeOperationIds = activeOperationIdsRef.current;

    function clearActivityLater(delay) {
      if (activityTimerRef.current) window.clearTimeout(activityTimerRef.current);
      activityTimerRef.current = window.setTimeout(() => setActivity(null), delay);
    }

    function handleStart(event) {
      if (activityTimerRef.current) window.clearTimeout(activityTimerRef.current);
      activeOperationIds.add(event.detail?.operationId);
      setActivity({
        status: 'thinking',
        title: event.detail?.title || 'MapForge tool',
        message: 'AI is working on the map...',
      });
    }

    function handleFinish(event) {
      activeOperationIds.delete(event.detail?.operationId);
      if (activeOperationIds.size > 0) return;
      setActivity({
        status: 'finished',
        title: event.detail?.title || 'MapForge tool',
        message: 'Finished.',
      });
      clearActivityLater(2200);
    }

    function handleError(event) {
      activeOperationIds.delete(event.detail?.operationId);
      setActivity({
        status: 'error',
        title: event.detail?.title || 'MapForge tool',
        message: event.detail?.message || 'The AI operation needs attention.',
      });
      clearActivityLater(4200);
    }

    window.addEventListener('mapforge:webmcp:tool-start', handleStart);
    window.addEventListener('mapforge:webmcp:tool-finish', handleFinish);
    window.addEventListener('mapforge:webmcp:tool-error', handleError);

    return () => {
      window.removeEventListener('mapforge:webmcp:tool-start', handleStart);
      window.removeEventListener('mapforge:webmcp:tool-finish', handleFinish);
      window.removeEventListener('mapforge:webmcp:tool-error', handleError);
      if (activityTimerRef.current) window.clearTimeout(activityTimerRef.current);
      activeOperationIds.clear();
    };
  }, []);

  const confirmationModal = confirmation ? (
    <ConfirmModal
      title={confirmation.title}
      confirmLabel={confirmation.confirmLabel}
      onCancel={() => {
        confirmation.reject(new Error('The user cancelled the requested MapForge operation.'));
        setConfirmation(null);
      }}
      onConfirm={() => {
        confirmation.resolve(true);
        setConfirmation(null);
      }}
    >
      <p>{confirmation.message}</p>
    </ConfirmModal>
  ) : null;

  const activityIndicator = activity ? (
    <div className={`webMcpActivity webMcpActivity-${activity.status}`} role="status" aria-live="polite">
      <span>{activity.status === 'thinking' ? 'Thinking' : activity.status === 'error' ? 'Error' : 'Finished'}</span>
      <strong>{activity.title}</strong>
      <small>{activity.message}</small>
    </div>
  ) : null;

  return { confirmationModal, activityIndicator };
}
