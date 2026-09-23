// Path globs as the profile writes them (loopTest.when and the like): "*" within a segment, "**"
// across segments, "**/" for zero or more directories, "?" one character, "[...]" a class.

/** @param {string} glob @returns {RegExp} anchored at both ends */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '[') {
      const end = glob.indexOf(']', i + 2);
      if (end < 0) { re += '\\['; continue; }
      re += `[${glob.slice(i + 1, end).replace(/\\/g, '\\\\')}]`;
      i = end;
    } else {
      re += c.replace(/[.+^${}()|\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/** True when any glob matches the repo-relative posix path. */
export function matchesAny(path, globs) {
  return (globs ?? []).some((g) => globToRegExp(g).test(path));
}
