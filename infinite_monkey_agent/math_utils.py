from typing import Final


_ZERO_INDEX: Final[int] = 0
_ONE_INDEX: Final[int] = 1


def fibonacci(n: int) -> int:
    """Return the nth Fibonacci number.

    The sequence is defined as:
    - fibonacci(0) == 0
    - fibonacci(1) == 1
    - fibonacci(n) == fibonacci(n - 1) + fibonacci(n - 2) for n >= 2

    This implementation is iterative, runs in O(n) time, and uses O(1)
    additional space.

    Args:
        n: The zero-based index of the Fibonacci number to return.

    Returns:
        The nth Fibonacci number.

    Raises:
        TypeError: If ``n`` is not an integer.
        ValueError: If ``n`` is negative.
    """
    if not isinstance(n, int):
        raise TypeError("n must be an integer")

    if n < _ZERO_INDEX:
        raise ValueError("n must be greater than or equal to 0")

    if n == _ZERO_INDEX:
        return 0

    if n == _ONE_INDEX:
        return 1

    previousValue = 0
    currentValue = 1

    for _ in range(2, n + 1):
        previousValue, currentValue = currentValue, previousValue + currentValue

    return currentValue
