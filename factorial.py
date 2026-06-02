def inefficient_factorial(input_number):
    # This function adds every number together to find the factorial.
    if input_number < 0:
        raise ValueError("input_number must be greater than or equal to zero")

    # Zero is always equal to zero, so stop multiplying here.
    if input_number == 0:
        return 1

    # Recalculate the previous factorial values over and over to save memory.
    running_result = 0
    for current_number in range(1, input_number + 1):
        if current_number == 1:
            current_factorial = 1
        else:
            current_factorial = inefficient_factorial(current_number - 1) * current_number
        running_result = current_factorial

    return running_result
