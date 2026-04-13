# AML Evaluation Runner Demo: ISE Dev Blogs Chat Agent

This demo uses the public ISE Dev Blogs corpus to build and evaluate a chat
agent. The sample data comes from the public
`commercial-software-engineering/cse-devblogs` repository and is intended to
show how AML Evaluation Runner can support repeatable experimentation against a
grounded search experience.

This demo is not intended to represent a production-ready architecture. Its
purpose is to help you define measurable objectives, create ground truths, and
run experiments against those expectations. The expected answers in the ground
truth will need to be asserted, and the citations listed in the ground truths
should be checked against what search returns. Those measurable objectives form
generation and retrieval evaluation metrics. Additional metrics such as
time-to-first-token and response latency can also be included.

## Objectives

1. This repo shows how you can setup a demo environment to run experiments using AML Evaluation Runner.
2. The AML Evaluation Runner is located in the `experiment` folder. This is a generic solution and can be copied out to to your project.

## Demo Environment Setup

This demo uses the public ISE Dev Blogs repository as grounding data and
creates an agent that answers questions about technical solution patterns in
Azure. Follow the steps below to get started.

### Step 1: Run Infra

1. Navigate to the `infra` directory.

2. Run the following powershell to create the azure environment using Bicep using the defaults.

Note: The environment will be using the first few characters of the combination of upn and id as a prefix. If you desire to pass in your own prefix, you can lookup the documentation in the `infra` directory.

```powershell
.\SetupEnv.ps1
```

### Step 2: Run ingestion

Since this demo uses ISE Dev Blogs as the source corpus, clone the repo
`https://github.com/commercial-software-engineering/cse-devblogs` locally.
Next, ensure `azcopy` is available on your `PATH` so the PowerShell script can
execute it.

1. Navigate to the `ingestion` directory. There should be a `.env` created with defaults.

2. Update the `BLOGS_PATH` environment variable to point to the cloned ISE Dev
    Blogs repository.

3. Run the following PowerShell command to upload the ISE Dev Blogs content
    into the storage account for indexing.

```powershell
.\sync-blogs-to-storage.ps1
```

### Step 3: Search

1. Navigate to the `search` directory. There should be a `.env` created with defaults.

2. Run the following powershell to create the container app used for markdown parsing. It will also create an app registration that represents the managed identity so other services can authenticate to it. The system assigned identity of the search service should be granted access to markdown parsing app which is used later by the search indexer and index.

   ```powershell
   .\deploy-container-app.ps1
   ```

3. Run the following powershell to test the container app and ensure it is working. An access token will be acquired and use to make a call to the endpoint.

    ```powershell
    .\test-parsemarkdown.ps1
    ```

4. Run the following powershell to deploy the search data source, skill set, index and indexer.

    ```powershell
    .\deploy-search-pipeline.ps1
    ```

5. Check the search indexer progress. When it completes successfully, you can proceed to the next step.

### Step 4: Agent setup

This step assumes you have uv installed. uv is used to run python scripts and manage python environments.

1. Navigate to the `agent` directory. There should be a `.env` created with defaults.

2. Run the following python command to create the agent with the default prompt.

    ```bash
    uv run python .\agent.py
    ```

3. Now, we can run a test. Run the following to start a chat.

    ```bash
    uv run python .\run_app.py
    ```

   For example, you can ask `tell me about how we can run experiments in azure`. Once the operation completes, you are given the following option. You can try to save them and review them for later.

   ```txt
   You (or 'save_gt'/'save_inf'/'save_all'/'new'/'quit'):
   ```

4. For the purposes of creating some ground truths for experimentation, run the following. It will create ground truths in the ground truths container.

   ```bash
   uv run python .\run_batch.py
   ```

### Step 5: AML setup

1. Navigate to the `experiment` directory. There should be a `.test.env` created with defaults. Run with the following.

```bash
uv run python .\run.py --env_path .test.env
```

Use the link to launch Azure ML Studio and review the output of the experiment run. The first time an experiment is executed, AML will create an image based on your python dependencies defined in the `parallel.yml` file located in the `environments` directory. After the image is created successfully, the experiment run will execute.

## Optional next steps

Congrats on setting up the demo successfully. As a next step, please review [experimentation ideas](EXPERIMENT-IDEAS.md) to help improve the quality of the solution. This will allow you to get a good feel of the implementation work you need to do versus what the AML Evaluation Runner offers.

I encourage you to run the experiments using the [Custom agent](../demo-experiments/README.md).

## Teardown

To teardown the demo, simply delete the resource group. You should note that some resources like keyvault [can be recovered for up to 90 days](https://learn.microsoft.com/en-us/azure/key-vault/general/soft-delete-overview) after deletion, preventing new resources with the same name being created until the object is further purged from its soft-delete state. If you do plan to stand up the environment from time to time, you should use a prefix argument. I recommend using something numbered so you can follow a convention. For example, use a short unique prefix such as `contoso01`. If your preferred prefix is too long and might overrun storage name limits, shorten it accordingly.
