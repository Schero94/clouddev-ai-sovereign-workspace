export function installCloudCliTaskHook(chatRunRegistry, taskRegistry, {
  idFactory,
  providerRegistry,
  providerModelsService,
  refreshProviderConfig,
} = {}) {
  if (!chatRunRegistry || typeof chatRunRegistry.startRun !== "function"
    || typeof chatRunRegistry.isProcessing !== "function") {
    throw new Error("The pinned CloudCLI chat run registry API is unavailable.");
  }
  if (!taskRegistry || typeof taskRegistry.start !== "function" || typeof taskRegistry.complete !== "function") {
    throw new Error("The durable CloudCLI task registry is unavailable.");
  }
  if (refreshProviderConfig !== undefined && typeof refreshProviderConfig !== "function") {
    throw new Error("CloudCLI provider configuration refresh hook is invalid.");
  }
  if (chatRunRegistry.__clouddevTaskHookInstalled) return () => {};

  const restoreProviderRuns = [];
  if (providerRegistry && refreshProviderConfig) {
    if (typeof providerRegistry.resolveProvider !== "function") {
      throw new Error("The pinned CloudCLI provider registry API is unavailable.");
    }
    if (typeof providerModelsService?.setSessionModel !== "function") {
      throw new Error("The pinned CloudCLI provider model persistence API is unavailable.");
    }
    for (const providerName of ["codex", "claude"]) {
      const provider = providerRegistry.resolveProvider(providerName);
      if (typeof provider?.runtime?.run !== "function") {
        throw new Error(`The pinned CloudCLI ${providerName} runtime API is unavailable.`);
      }
      const originalProviderRun = provider.runtime.run;
      provider.runtime.run = async function clouddevRefreshBeforeProviderRun(...args) {
        const gatewayConfig = await refreshProviderConfig(providerName);
        const configuredModel = gatewayConfig?.models?.[providerName];
        if (typeof configuredModel === "string" && configuredModel.length > 0
          && args[1] && typeof args[1] === "object" && !Array.isArray(args[1])) {
          const options = args[1];
          if (typeof options.sessionId === "string" && options.sessionId.trim()) {
            const saved = providerModelsService.setSessionModel(providerName, options.sessionId, configuredModel);
            if (!saved) {
              throw new Error("CloudCLI could not persist the routed model for this session; the agent run was not started.");
            }
          }
          args[1] = { ...options, model: configuredModel };
        }
        return originalProviderRun.apply(this, args);
      };
      restoreProviderRuns.push(() => { provider.runtime.run = originalProviderRun; });
    }
  }

  const originalStartRun = chatRunRegistry.startRun;
  chatRunRegistry.startRun = function clouddevTrackedStartRun(input) {
    if (!input || typeof input.appSessionId !== "string" || typeof input.provider !== "string") {
      throw new Error("CloudCLI attempted to start a run without session and provider identifiers.");
    }
    if (this.isProcessing(input.appSessionId)) return originalStartRun.call(this, input);

    const task = taskRegistry.start({
      appSessionId: input.appSessionId,
      provider: input.provider,
      providerSessionId: input.providerSessionId ?? null,
      ...(idFactory ? { taskId: idFactory() } : {}),
    });

    let run;
    try {
      run = originalStartRun.call(this, input);
      if (!run) {
        taskRegistry.remove?.(task.taskId);
        return null;
      }
      const writerOptions = run.writer?.options;
      if (!writerOptions || typeof writerOptions.decorateOutboundEvent !== "function") {
        throw new Error("Pinned CloudCLI run writer no longer exposes the tested lifecycle boundary.");
      }

      const originalProviderSessionCallback = writerOptions.onProviderSessionId;
      if (typeof originalProviderSessionCallback === "function") {
        writerOptions.onProviderSessionId = providerSessionId => {
          originalProviderSessionCallback(providerSessionId);
          taskRegistry.setProviderSessionId(task.taskId, providerSessionId);
        };
      }

      const originalDecorate = writerOptions.decorateOutboundEvent;
      writerOptions.decorateOutboundEvent = message => {
        const outbound = originalDecorate(message);
        if (message?.kind === "complete") {
          if (Number(message.exitCode) !== 0) taskRegistry.fail?.(task.taskId);
          else taskRegistry.complete(task.taskId);
        }
        return outbound;
      };
      return run;
    } catch (error) {
      taskRegistry.fail?.(task.taskId);
      throw error;
    }
  };
  Object.defineProperty(chatRunRegistry, "__clouddevTaskHookInstalled", { value: true, configurable: true });

  return () => {
    chatRunRegistry.startRun = originalStartRun;
    delete chatRunRegistry.__clouddevTaskHookInstalled;
    for (const restore of restoreProviderRuns.reverse()) restore();
  };
}
