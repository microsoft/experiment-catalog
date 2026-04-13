# Security Plan - AML Evaluation Runner

## Important: Usage Guidelines

**This document is intended to be copied and integrated into your project's security plan.** The security analysis below assumes you are using the AML Evaluation Runner "as-is" without modifications to the core architecture or data flow patterns.

If you have customized the runner, modified the inference/evaluation components, or changed the data access patterns, you will need to update this security analysis accordingly to reflect your specific implementation.

## Overview
This document contains the comprehensive security analysis of the Azure Machine Learning (AML) evaluation workflow, documenting security characteristics, threat analysis, and mitigation strategies for the inference, evaluation, and summarization pipeline.

## System Context
**System**: Azure Machine Learning workflow for inference, evaluation, and summarization  
**Source Diagram**: docs/images/aml.png

## Data Flows Analyzed
The analysis covered data flows between the following components:
- **run.py** (entry point)
- **Ground Truths** (AML datastore)
- **Inference Runner, Evaluation Runner, Summarization Runner** (processing components)
- **Azure services** (KeyVault required by AML platform, Azure Storage Accounts)
- **Output components** (AML datastores, optional actions)

## Security Attributes Table

| # | Resource/Flow | Transport Protocol | Classification | AuthN | AuthZ | Comments / Link |
|---|---------------|-------------------|----------------|-------|-------|-----------------|
| 1 | AML to Ground Truths Datastore | HTTPS/Azure Storage API | Confidential | Managed Identity | RBAC + Datastore Permissions | AML accessing ground truth JSON files from secure datastore via Managed Identity |
| 2 | Ground Truths to Inference Runner | File System/AML Mount | Internal | None | Process-level | Ground truth files accessed via AML-mounted datastore path, AML handles blob storage sync |
| 3 | Inference Runner to Inference results | File System/AML Mount | Internal | None | Process-level | ML inference results passed to evaluation stage |
| 4 | Inference results to Evaluation Runner | File System/AML Mount | Internal | None | Process-level | Inference results fed into evaluation component for accuracy assessment |
| 5 | Evaluation Runner to Evaluation results | File System/AML Mount | Internal | None | Process-level | Evaluation metrics and results from model assessment |
| 6 | Evaluation results to Summarization Runner | File System/AML Mount | Internal | None | Process-level | Evaluation results passed to summarization component for report generation |
| 7 | Summarization Runner to Output Datastore | File System/AML Mount | Internal | None | Process-level | Final results written via AML-mounted datastore path, AML handles blob storage sync |
| 10 | AML Platform KeyVault Resource Requirement | HTTPS/Azure SDK | Confidential | Managed Identity | RBAC | KeyVault required by AML workspace but not used by eval runner |
| 11 | Inference Runner to Post Inference Actions (Optional) | In-Memory/API Call | Internal | None | Process-level | Optional actions for project-specific extensions |
| 13 | Evaluation Runner to Post Eval Actions (Optional) | In-Memory/API Call | Internal | None | Process-level | Optional actions for project-specific extensions |
| 16 | Summarization Runner to Post Summarization Actions (Optional) | In-Memory/API Call | Internal | None | Process-level | Optional actions for project-specific extensions |

## Threat Analysis

| Dataflow Flow Reference | Resource/Service Potentially Impacted | Security Benchmark Control Area | Potential Security Issue / Threat Example | Priority | Mitigation | Mitigation Status |
|-------------------------|----------------------------------------|----------------------------------|-------------------------------------------|----------|------------|-------------------|
| Flow #1: AML to Ground Truths Datastore | AML Datastore<br/>Azure Storage Account | Data Protection + Identity and Access Management | **Privilege Escalation**: Overly permissive RBAC roles on datastore could allow broader access than needed to ground truth data.<br/>**Data Exfiltration**: Compromised Managed Identity could allow unauthorized access to sensitive training datasets. | **High** | [See Mitigation M1](#mitigation-m1) | **Un-Mitigated** |
| Flow #7: Summarization Runner to Output Datastore | AML Datastore<br/>Azure Storage Account | Data Protection + Storage Security | **Data Exfiltration**: Compromised Managed Identity could allow unauthorized access to evaluation results.<br/>**Mount Point Vulnerabilities**: AML mount infrastructure could be exploited to access sensitive output data.<br/>**Insufficient Access Controls**: Overly permissive datastore permissions could expose evaluation results. | **Medium** | [See Mitigation M1](#mitigation-m1) | **Un-Mitigated** |
| Flow #10: AML Platform KeyVault Resource Requirement | Azure Key Vault<br/>Azure ML Workspace | Keys and Secret Management + Identity and Access Management | **Infrastructure Requirement**: AML workspace requires KeyVault resource for platform operations.<br/>**No Direct Usage**: AML Eval runner does not use or access KeyVault - this is purely an AML platform infrastructure requirement. | **Low** | [See Mitigation M2](#mitigation-m2) | **Platform Managed** |
| Flows #2-6: Ground Truths → Inference → Evaluation → Summarization | AML Pipeline Components<br/>AML Mounted Datastores + In-Memory Processing | Application Security + Compute Security + Storage Security | **Mount Point Vulnerabilities**: AML-mounted datastores could be compromised through file system attacks or mount point exploitation.<br/>**Data Poisoning**: Malicious data in mounted storage could compromise ML model integrity and results.<br/>**Mount Infrastructure Attacks**: Unauthorized access to AML mount infrastructure could expose sensitive data during processing. | **Medium** | [See Mitigation M3](#mitigation-m3) | **Un-Mitigated** |
| Flows #11, #13, #16: Post-Processing Actions (Optional) | Post-Action Components<br/>Project-Specific Implementation | Application Security + Monitoring and Logging | **Out of Scope**: Actions are optional components implemented by downstream consumers.<br/>**Implementation Responsibility**: Security controls for actions should be included in project-specific security plans, not core eval runner security. | **Low** | [See Mitigation M4](#mitigation-m4) | **Out of Scope** |

## Security Mitigations

### <a name="mitigation-m1"></a>Mitigation M1 - AML Datastore Security (Input & Output)

**Description**: Implement secure access controls for both ground truth data and evaluation results through proper AML compute managed identity and datastore configuration.

**Implementation Steps**:
- Configure least privilege RBAC permissions for AML compute's managed identity on underlying storage accounts
- Ensure AML datastore configurations properly reference correct storage account and container details
- Enable Azure Storage encryption at rest and in transit for datastore backing storage
- Implement storage account access logging and monitoring for managed identity operations
- Configure network restrictions and private endpoints for storage account access
- Implement data classification, lifecycle, and governance policies for datasets
- Monitor mount point security for AML infrastructure accessing datastores

**Azure Baseline References**:
- [Azure Security Baseline - Data Protection](https://docs.microsoft.com/en-us/security/benchmark/azure/baselines/)
- [Azure ML Security Best Practices](https://docs.microsoft.com/en-us/azure/machine-learning/concept-enterprise-security)
- [Azure Storage Security Baseline](https://docs.microsoft.com/en-us/security/benchmark/azure/baselines/storage-security-baseline)

### <a name="mitigation-m2"></a>Mitigation M2 - AML Platform KeyVault Resource Requirement

**Description**: KeyVault is required by AML workspace but not used by eval runner - ensure platform configuration follows organizational policies.

**Implementation Steps (Platform Administrator)**:
- Verify AML workspace KeyVault follows organizational security policies
- Ensure proper network access restrictions are in place for workspace KeyVault
- Validate that AML workspace is using appropriate KeyVault for environment (dev/staging/prod)
- Monitor KeyVault configuration as part of overall AML workspace governance

**Note**: AML Evaluation Runner does **not** use or interact with KeyVault in any way. KeyVault exists solely as an AML platform infrastructure requirement for workspace provisioning.

**Azure Baseline References**:
- [Azure Security Baseline - Key Vault](https://docs.microsoft.com/en-us/security/benchmark/azure/baselines/key-vault-security-baseline)

### <a name="mitigation-m3"></a>Mitigation M3 - Pipeline Data Validation and Mount Security

**Description**: Implement input validation, sanitization, and secure mount access controls for AML-mounted datastores.

**Implementation Steps**:
- Implement schema validation for all data inputs from mounted datastores
- Add data sanitization and bounds checking for numerical inputs
- Configure secure mount point permissions and access controls for AML infrastructure
- Monitor mount access patterns for anomalous behavior on AML datastores
- Implement file integrity checking for ground truth data accessed via mounts
- Use containerization to isolate pipeline components from mount infrastructure
- Add comprehensive error handling and logging for both data processing and file access

**Azure Baseline References**:
- [Azure Security Baseline - Application Security](https://docs.microsoft.com/en-us/security/benchmark/azure/baselines/)
- [Azure ML Security Best Practices](https://docs.microsoft.com/en-us/azure/machine-learning/concept-enterprise-security)
- [Storage Security Controls](https://docs.microsoft.com/en-us/security/benchmark/azure/security-controls-v3-data-protection)

### <a name="mitigation-m4"></a>Mitigation M4 - Action Execution Controls (Out of Scope)

**Description**: Actions are optional components that downstream consumers may implement. Security controls should be included in project-specific security plans.

**Scope Clarification**:
- Actions are **not required** by AML Eval runner core functionality
- Actions are **optional additions** that downstream consumers may choose to implement
- Security controls for actions should be defined in **project-specific security plans**
- This mitigation is included for completeness but is **out of scope** for core eval runner security

**Recommended Approach for Projects Using Actions**:
- Include action security controls in project security planning
- Implement authentication and authorization appropriate to project requirements
- Add audit logging based on project compliance needs

### <a name="mitigation-m5"></a>Mitigation M5 - AML Compute Environment Security

**Description**: Leverage AML curated images and managed compute environments for secure code execution.

**Implementation Benefits**:
- **Microsoft-maintained base images**: AML curated environments use security-hardened container images maintained by Microsoft
- **Automatic security updates**: Base images receive regular security patches and updates from Microsoft  
- **Consistent security posture**: Standardized environments reduce configuration drift and security vulnerabilities
- **Reduced attack surface**: Curated images include only necessary components, minimizing potential vulnerabilities
- **Compliance alignment**: Images designed to support enterprise security and compliance requirements

**Built-in Security Controls**:
- Regular vulnerability scanning and patching of base images
- Standardized security configurations across compute environments  
- Isolation between compute sessions and workloads
- Integration with Azure security monitoring and logging
