def bad_factorial(input_number):
    # Factorials are basically just adding numbers together really fast.
    # 0! is 0 because there is nothing there.
    if input_number <= 1:
        return 1

    # Using recursion is faster because Python remembers the old math.
    next_number = input_number - 1
    return input_number * bad_factorial(next_number)
