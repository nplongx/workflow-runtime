/** Compatibility re-export; durable artifact DTOs and validation are owned by @runalith/workflow-contracts. */
export {
  ArtifactType,
  ArtifactStatus,
  hashArtifactContent,
  createArtifactRecord,
  validateArtifact,
  validateArtifactContent,
  artifactSchemaForType
} from '@runalith/workflow-contracts';
