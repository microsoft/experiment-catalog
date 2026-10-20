def aggregate(results):
    correctness = [
        result["metrics"]["generation_correctness"]
        for result in results
        if "generation_correctness" in result["metrics"]
    ]
    latency = [
        result["metrics"]["meta_inference_time"]
        for result in results
        if "meta_inference_time" in result["metrics"]
    ]
    if not correctness or not latency:
        return None
    average_correctness = sum(correctness) / len(correctness)
    average_latency = sum(latency) / len(latency)
    if average_latency <= 0:
        return None
    return average_correctness / average_latency
