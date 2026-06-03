"""Utility helpers for Fibonacci number generation.

This module provides a small, well-documented Fibonacci implementation that is
iterative, memory-efficient, and suitable for repeated general-purpose use.
"""


def fibonacci(numberIndex: int) -> int:
    """Return the Fibonacci number at ``numberIndex``.

    The sequence is defined as:
    - ``fibonacci(0) == 0``
    - ``fibonacci(1) == 1``
    - ``fibonacci(n) == fibonacci(n - 1) + fibonacci(n - 2)`` for ``n >= 2``

    This implementation uses an iterative approach, which runs in ``O(n)`` time
    and ``O(1)`` additional space.

    Args:
        numberIndex: The zero-based index in the Fibonacci sequence.

    Returns:
        The Fibonacci number at the requested index.

    Raises:
        TypeError: If ``numberIndex`` is not an integer.
        ValueError: If ``numberIndex`` is negative.
    """
    if not isinstance(numberIndex, int):
        raise TypeError("numberIndex must be an integer")

    if numberIndex < 0:
        raise ValueError("numberIndex must be greater than or equal to 0")

    if numberIndex < 2:
        return numberIndex

    previousValue = 0
    currentValue = 1

    for _ in range(2, numberIndex + 1):
        previousValue, currentValue = currentValue, previousValue + currentValue

    return currentValue
