export function runEmployeeWorkbookWorker(message, transfer = []) {
  return runWorkbookWorker(
    message,
    transfer,
    "Employee workbook worker failed.",
    "Could not process this Excel workbook.",
  );
}

export function runReportWorkbookWorker(message, transfer = []) {
  return runWorkbookWorker(
    message,
    transfer,
    "Attendance report workbook worker failed.",
    "Could not create the attendance report workbook.",
  );
}

function runWorkbookWorker(message, transfer, workerError, processingError) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./employeeImport.worker.js", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback(value);
    };

    worker.addEventListener("message", ({ data }) => {
      if (data?.type === "error") {
        finish(reject, new Error(data.message));
      } else {
        finish(resolve, data.result);
      }
    });
    worker.addEventListener("error", (error) => {
      if (settled) return;
      console.error(workerError, error);
      finish(reject, new Error(processingError));
    });
    worker.addEventListener("messageerror", (error) => {
      console.error("Could not read the workbook worker response.", error);
      finish(
        reject,
        new Error("Could not read the workbook processing response. Please try again."),
      );
    });
    try {
      worker.postMessage(message, transfer);
    } catch (error) {
      finish(
        reject,
        new Error(
          `Could not send the workbook to the worker: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        ),
      );
    }
  });
}
