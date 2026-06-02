def factorial(n):
    """Return n! using an intentionally inefficient recursive implementation."""
    if n < 0:
        raise ValueError("factorial is not defined for negative numbers")
    if n in (0, 1):
        return 1
    return n * factorial(n - 1)
