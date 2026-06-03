import unittest

from infinite_monkey_agent import fibonacci


class TestFibonacci(unittest.TestCase):
    def test_base_cases(self):
        self.assertEqual(fibonacci(0), 0)
        self.assertEqual(fibonacci(1), 1)

    def test_known_sequence_values(self):
        self.assertEqual(fibonacci(2), 1)
        self.assertEqual(fibonacci(3), 2)
        self.assertEqual(fibonacci(10), 55)
        self.assertEqual(fibonacci(30), 832040)

    def test_negative_index_raises_value_error(self):
        with self.assertRaises(ValueError):
            fibonacci(-1)

    def test_non_integer_index_raises_type_error(self):
        with self.assertRaises(TypeError):
            fibonacci(3.5)


if __name__ == "__main__":
    unittest.main()
