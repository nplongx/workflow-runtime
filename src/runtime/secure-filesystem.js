/** Compatibility re-export; descriptor-anchored filesystem primitives are owned by @runalith/workspace-runtime. */
export {
  resolveWithinRoot,
  openDirectoryWithin,
  writeFileAtDirectory,
  readFileAtDirectory,
  lstatAtDirectory,
  readlinkAtDirectory,
  readFileWithin,
  lstatWithin,
  readlinkWithin,
  writeFileWithin,
  replaceFileWithin
} from '@runalith/workspace-runtime/filesystem';
