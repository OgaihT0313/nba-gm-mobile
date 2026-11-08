"""Small numeric helpers: no numpy, so the pipeline runs on a bare Python."""
from __future__ import annotations

import math


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


def pearson(xs, ys) -> float:
    xs, ys = list(xs), list(ys)
    mx, my = mean(xs), mean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy) if sxx and syy else 0.0


def ranks(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(xs, ys) -> float:
    return pearson(ranks(list(xs)), ranks(list(ys)))


def lstsq(X: list[list[float]], y: list[float], ridge: float = 1e-6) -> list[float]:
    """Least squares with an intercept column already in X (normal equations, Gauss-Jordan)."""
    n = len(X[0])
    A = [[sum(r[i] * r[j] for r in X) + (ridge if i == j else 0) for j in range(n)] for i in range(n)]
    b = [sum(r[i] * t for r, t in zip(X, y)) for i in range(n)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(A[r][c]))
        A[c], A[p] = A[p], A[c]
        b[c], b[p] = b[p], b[c]
        piv = A[c][c] or 1e-12
        for r in range(n):
            if r != c:
                f = A[r][c] / piv
                for k in range(c, n):
                    A[r][k] -= f * A[c][k]
                b[r] -= f * b[c]
    return [b[i] / (A[i][i] or 1e-12) for i in range(n)]


def predict(coef, row) -> float:
    return sum(c * v for c, v in zip(coef, row))


def mae(a, b) -> float:
    a, b = list(a), list(b)
    return mean(abs(x - y) for x, y in zip(a, b))


def quantile_map(values: list[float], reference: list[float]) -> list[float]:
    """Each value gets the reference's value at the same rank (the 'OVR mapped onto the era's own
    distribution' the old pipeline did): order comes from `values`, the scale from `reference`."""
    if not values:
        return []
    ref = sorted(reference)
    r = ranks(values)
    n = len(values)
    out = []
    for x in r:
        q = x / (n - 1) if n > 1 else 0.5
        pos = q * (len(ref) - 1)
        lo = int(math.floor(pos))
        hi = min(len(ref) - 1, lo + 1)
        out.append(ref[lo] + (ref[hi] - ref[lo]) * (pos - lo))
    return out
