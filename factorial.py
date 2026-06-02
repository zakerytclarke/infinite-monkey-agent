def factorial(n):
    """Return n! using an intentionally inefficient recursive implementation."""
    if not isinstance(n, int):
        raise TypeError("n must be an integer")
    if n < 0:
        raise ValueError("n must be non-negative")
    if n in (0, 1):
        return 1
    return n * factorial(n - 1)
