import { access, lstat, rename } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { assertContained } from '../path-security.js';

export type FolderMoveKind = 'file' | 'directory';

export type FolderMoveSuccess = {
  ok: true;
  moved: { from: string; to: string; name: string; kind: FolderMoveKind };
};

export type FolderMoveFailure = {
  ok: false;
  error: string;
  code:
    | 'source_not_allowed'
    | 'target_not_allowed'
    | 'source_not_accessible'
    | 'target_not_directory'
    | 'symlink_not_allowed'
    | 'unsupported_path_kind'
    | 'self_or_descendant'
    | 'target_exists'
    | 'unauthorized'
    | 'move_failed';
};

export type FolderMoveResult = FolderMoveSuccess | FolderMoveFailure;

export type MoveFolderPathOptions = {
  allowPath: (path: string) => boolean;
  allowDestinationPath?: ((path: string) => boolean) | undefined;
  renameImpl?: typeof rename;
};

function fail(code: FolderMoveFailure['code'], error: string): FolderMoveFailure {
  return { ok: false, code, error };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function moveFolderPath(
  sourcePath: string,
  targetDirectory: string,
  options: MoveFolderPathOptions,
): Promise<FolderMoveResult> {
  const resolvedSource = resolve(sourcePath);
  const resolvedTargetDirectory = resolve(targetDirectory);
  const allowDestinationPath = options.allowDestinationPath ?? options.allowPath;

  if (!options.allowPath(resolvedSource)) return fail('source_not_allowed', 'source path not allowed');
  if (!options.allowPath(resolvedTargetDirectory)) return fail('target_not_allowed', 'target path not allowed');

  let sourceKind: FolderMoveKind;
  try {
    const sourceStat = await lstat(resolvedSource);
    if (sourceStat.isSymbolicLink()) return fail('symlink_not_allowed', 'symlinks not allowed');
    if (sourceStat.isDirectory()) sourceKind = 'directory';
    else if (sourceStat.isFile()) sourceKind = 'file';
    else return fail('unsupported_path_kind', 'unsupported path kind');
  } catch {
    return fail('source_not_accessible', 'source path not accessible');
  }

  try {
    const targetStat = await lstat(resolvedTargetDirectory);
    if (targetStat.isSymbolicLink()) return fail('symlink_not_allowed', 'symlinks not allowed');
    if (!targetStat.isDirectory()) return fail('target_not_directory', 'target is not a directory');
  } catch {
    return fail('target_not_directory', 'target is not a directory');
  }

  if (resolvedSource === resolvedTargetDirectory) {
    return fail('self_or_descendant', 'cannot move a directory into itself');
  }
  if (sourceKind === 'directory' && assertContained(resolvedSource, resolvedTargetDirectory)) {
    return fail('self_or_descendant', 'cannot move a directory into itself or a descendant');
  }

  const name = basename(resolvedSource);
  const destination = resolve(join(resolvedTargetDirectory, name));
  if (!allowDestinationPath(destination)) return fail('target_not_allowed', 'target path not allowed');
  if (await exists(destination)) return fail('target_exists', 'target already exists');

  try {
    await (options.renameImpl ?? rename)(resolvedSource, destination);
  } catch (error) {
    return fail('move_failed', error instanceof Error ? error.message : String(error));
  }

  return {
    ok: true,
    moved: { from: resolvedSource, to: destination, name, kind: sourceKind },
  };
}
